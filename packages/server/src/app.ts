/**
 * HTTP API (node:http, no framework).
 *
 *   GET  /healthz
 *   GET  /v1/content/modules                         latest version of each module (summary)
 *   GET  /v1/content/modules/:module/versions/:v     full module JSON (answer keys included: the phone scores offline)
 *   POST /v1/enroll                                  learner + device enrollment; returns the device token once
 *   POST /v1/sync/events                             device token; per-event results
 *   POST /v1/trainer/login | /v1/trainer/logout
 *   GET  /v1/trainer/cohorts                         POST to create (returns an enrollment code)
 *   GET  /v1/trainer/cohorts/:id/codes               POST to issue another code
 *   POST /v1/trainer/codes/:code/revoke
 *   GET  /v1/trainer/cohorts/:id/report              scores, time and sync status per learner
 *   GET  /v1/trainer/cohorts/:id/export              the report plus every accepted and rejected event
 *   POST /v1/trainer/learners/:id/relink             one-time code to move a learner to a new phone
 *   POST /v1/trainer/devices/:id/revoke
 *
 * See openapi.yaml for request and response shapes.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { isUuid, MAX_BODY_BYTES, MAX_EVENTS_PER_BATCH, SCHEMA_VERSION, USERNAME_PATTERN } from "../../contract/src/index.ts";
import { buildLearnerReport } from "../../analytics/src/index.ts";
import type { Config } from "./config.ts";
import type { ContentRegistry } from "./content.ts";
import { ingestBatch } from "./ingest.ts";
import { RateLimiter } from "./rate-limit.ts";
import { hashToken, newShortCode, newToken, normalizeCode, verifyPassword } from "./security.ts";
import type { Store, Trainer } from "./store.ts";

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly headers: Record<string, string>;
  constructor(status: number, code: string, message: string, headers: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}

interface Ctx {
  req: IncomingMessage;
  res: ServerResponse;
  params: Record<string, string>;
  now: string;
}
type Handler = (ctx: Ctx) => Promise<unknown>;

export interface AppDeps {
  store: Store;
  content: ContentRegistry;
  config: Config;
  /** Injectable clock for tests. */
  clock?: () => Date;
}

const send = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
  const text = body === undefined ? "" : JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers });
  res.end(text);
};

async function readJson(req: IncomingMessage): Promise<unknown> {
  const declared = Number(req.headers["content-length"] ?? 0);
  if (declared > MAX_BODY_BYTES) throw new HttpError(413, "TOO_LARGE", `Request body is over ${MAX_BODY_BYTES} bytes; send fewer events per batch.`);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, "TOO_LARGE", `Request body is over ${MAX_BODY_BYTES} bytes; send fewer events per batch.`);
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "null");
  } catch {
    throw new HttpError(400, "INVALID_JSON", "Request body is not valid JSON.");
  }
}

const bearer = (req: IncomingMessage): string | null => {
  const h = req.headers.authorization;
  return h && /^Bearer\s+\S+$/i.test(h) ? h.replace(/^Bearer\s+/i, "") : null;
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() !== "" && v.trim().length <= max ? v.trim() : null);

export function createApp(deps: AppDeps) {
  const { store, content, config } = deps;
  const clock = deps.clock ?? (() => new Date());
  const authLimiter = new RateLimiter(config.authRateLimitPerMinute, 60_000);
  const routes: { method: string; pattern: RegExp; keys: string[]; handler: Handler }[] = [];

  const route = (method: string, path: string, handler: Handler) => {
    const keys: string[] = [];
    const pattern = new RegExp(`^${path.replace(/:(\w+)/g, (_m, k) => (keys.push(k), "([^/]+)"))}$`);
    routes.push({ method, pattern, keys, handler });
  };

  const clientAddress = (req: IncomingMessage) =>
    (config.trustProxy ? String(req.headers["x-forwarded-for"] ?? "").split(",")[0]?.trim() : "") || req.socket.remoteAddress || "unknown";

  const limitAuth = (ctx: Ctx) => {
    const wait = authLimiter.take(clientAddress(ctx.req), Date.parse(ctx.now));
    if (wait > 0) throw new HttpError(429, "RATE_LIMITED", "Too many attempts. Wait a minute and try again.", { "retry-after": String(Math.ceil(wait / 1000)) });
  };

  const requireTrainer = async (ctx: Ctx): Promise<Trainer> => {
    const token = bearer(ctx.req);
    const trainer = token ? await store.getTrainerSession(hashToken(token), ctx.now) : undefined;
    if (!trainer) throw new HttpError(401, "UNAUTHORIZED", "Sign in as a trainer to see this.");
    return trainer;
  };

  const requireCohort = async (id: string) => {
    const cohort = isUuid(id) ? await store.getCohort(id) : undefined;
    if (!cohort) throw new HttpError(404, "NOT_FOUND", "Cohort not found.");
    return cohort;
  };

  const issueCode = async (cohortId: string, body: Record<string, unknown>, now: string) => {
    const requested = body.code === undefined ? null : text(body.code, 64);
    if (body.code !== undefined && (!requested || !/^[A-Za-z0-9][A-Za-z0-9-]{3,63}$/.test(requested))) {
      throw new HttpError(400, "INVALID_INPUT", "code must be 4–64 letters, digits or hyphens.");
    }
    let expires: string | null = null;
    if (body.expires_at !== undefined && body.expires_at !== null) {
      if (typeof body.expires_at !== "string" || Number.isNaN(Date.parse(body.expires_at))) throw new HttpError(400, "INVALID_INPUT", "expires_at must be an ISO 8601 date.");
      expires = new Date(body.expires_at).toISOString();
      if (expires <= now) throw new HttpError(400, "INVALID_INPUT", "expires_at must be in the future.");
    }
    for (let tries = 0; tries < 5; tries++) {
      const code = requested ? normalizeCode(requested) : newShortCode();
      const created = await store.createCode({ code, kind: "cohort", cohort_id: cohortId, learner_id: null, expires_at: expires, revoked_at: null, max_uses: null, uses: 0 });
      if (created) return { code, expires_at: expires };
      if (requested) throw new HttpError(409, "CODE_TAKEN", "That code is already in use. Choose another.");
    }
    throw new HttpError(500, "SERVER_ERROR", "Could not generate a unique code.");
  };

  // ------------------------------------------------------------ public

  route("GET", "/healthz", async () => ({ ok: true }));

  route("GET", "/v1/content/modules", async () => ({
    modules: content.library.moduleIds().map((id) => {
      const m = content.library.latest(id)!;
      return { module_id: m.module_id, content_version: m.content_version, title: m.title, questions: m.questions.length, boss_missions: m.boss_missions?.length ?? 0 };
    }),
  }));

  route("GET", "/v1/content/modules/:module/versions/:version", async ({ params }) => {
    const m = content.library.get(params.module!, Number(params.version));
    if (!m) throw new HttpError(404, "NOT_FOUND", "That module version is not published.");
    return m;
  });

  route("POST", "/v1/enroll", async (ctx) => {
    limitAuth(ctx);
    const body = await readJson(ctx.req);
    if (!isRecord(body)) throw new HttpError(400, "INVALID_INPUT", "Send a JSON object.");
    const name = text(body.name, 80);
    const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
    const deviceId = typeof body.device_id === "string" ? body.device_id.toLowerCase() : "";
    const code = typeof body.enrollment_code === "string" ? body.enrollment_code : typeof body.relink_code === "string" ? body.relink_code : null;
    if (!name) throw new HttpError(400, "INVALID_INPUT", "Enter your name (up to 80 characters).");
    if (!USERNAME_PATTERN.test(username)) throw new HttpError(400, "INVALID_INPUT", "Usernames are 3–32 lowercase letters, numbers, dots, dashes or underscores.");
    if (!isUuid(deviceId)) throw new HttpError(400, "INVALID_INPUT", "device_id must be a UUID created on the phone.");
    if (!code || (body.enrollment_code !== undefined && body.relink_code !== undefined)) throw new HttpError(400, "INVALID_INPUT", "Send either enrollment_code or relink_code.");

    const token = newToken();
    const result = await store.enroll({
      code: normalizeCode(code),
      now: ctx.now,
      learner: { learner_id: randomUUID(), name, username },
      device: { device_id: deviceId, token_hash: hashToken(token) },
    });
    if (!result.ok) {
      if (result.reason === "USERNAME_TAKEN") {
        throw new HttpError(409, "USERNAME_TAKEN", "That username is already taken in this cohort. If you're moving to a new phone, ask your trainer for a re-link code.");
      }
      if (result.reason === "DEVICE_EXISTS") throw new HttpError(409, "DEVICE_EXISTS", "This phone is already enrolled. Reinstall clears it; ask your trainer for a re-link code.");
      throw new HttpError(422, "INVALID_CODE", "That code isn't valid. Check it with your trainer.");
    }
    ctx.res.statusCode = 201;
    return { learner_id: result.learner.learner_id, device_id: deviceId, device_token: token, cohort: { cohort_id: result.cohort.cohort_id, name: result.cohort.name } };
  });

  route("POST", "/v1/sync/events", async (ctx) => {
    // Authenticate before reading or storing anything.
    const token = bearer(ctx.req);
    const device = token ? await store.getDeviceByTokenHash(hashToken(token)) : undefined;
    if (!device || device.revoked_at) throw new HttpError(401, "UNAUTHORIZED", "This phone's sign-in is not valid. Your work is still saved on the phone.");
    const body = await readJson(ctx.req);
    if (!isRecord(body) || !Array.isArray(body.events)) throw new HttpError(400, "INVALID_INPUT", "Send { schema_version, events: [...] }.");
    if (body.schema_version !== SCHEMA_VERSION) throw new HttpError(400, "UNSUPPORTED_SCHEMA_VERSION", `schema_version must be ${SCHEMA_VERSION}.`);
    if (body.events.length > MAX_EVENTS_PER_BATCH) throw new HttpError(413, "TOO_MANY_EVENTS", `Send at most ${MAX_EVENTS_PER_BATCH} events per request.`);
    const results = await ingestBatch(body.events, device, store, content.library, ctx.now);
    return { schema_version: SCHEMA_VERSION, received_at: ctx.now, results };
  });

  // ------------------------------------------------------------ trainer

  route("POST", "/v1/trainer/login", async (ctx) => {
    limitAuth(ctx);
    const body = await readJson(ctx.req);
    const username = isRecord(body) && typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
    const password = isRecord(body) && typeof body.password === "string" ? body.password : "";
    const trainer = username ? await store.getTrainerByUsername(username) : undefined;
    if (!trainer || !(await verifyPassword(password, trainer.password_hash))) throw new HttpError(401, "UNAUTHORIZED", "Username or password is wrong.");
    const token = newToken();
    const expires = new Date(Date.parse(ctx.now) + config.trainerSessionHours * 3600_000).toISOString();
    await store.createTrainerSession(hashToken(token), trainer.trainer_id, expires);
    return { token, expires_at: expires, trainer: { username: trainer.username, name: trainer.name } };
  });

  route("POST", "/v1/trainer/logout", async (ctx) => {
    await requireTrainer(ctx);
    await store.deleteTrainerSession(hashToken(bearer(ctx.req)!));
    return { ok: true };
  });

  route("GET", "/v1/trainer/cohorts", async (ctx) => {
    await requireTrainer(ctx);
    return { cohorts: await store.listCohorts() };
  });

  route("POST", "/v1/trainer/cohorts", async (ctx) => {
    const trainer = await requireTrainer(ctx);
    const body = await readJson(ctx.req);
    if (!isRecord(body)) throw new HttpError(400, "INVALID_INPUT", "Send a JSON object.");
    const name = text(body.name, 120);
    if (!name) throw new HttpError(400, "INVALID_INPUT", "Give the cohort a name (up to 120 characters).");
    const cohort = { cohort_id: randomUUID(), name, created_at: ctx.now };
    await store.createCohort(cohort, trainer.trainer_id);
    const code = await issueCode(cohort.cohort_id, body, ctx.now);
    ctx.res.statusCode = 201;
    return { cohort, enrollment_code: code };
  });

  route("GET", "/v1/trainer/cohorts/:id/codes", async (ctx) => {
    await requireTrainer(ctx);
    await requireCohort(ctx.params.id!);
    return { codes: await store.listCodes(ctx.params.id!) };
  });

  route("POST", "/v1/trainer/cohorts/:id/codes", async (ctx) => {
    await requireTrainer(ctx);
    const cohort = await requireCohort(ctx.params.id!);
    const body = await readJson(ctx.req);
    ctx.res.statusCode = 201;
    return { enrollment_code: await issueCode(cohort.cohort_id, isRecord(body) ? body : {}, ctx.now) };
  });

  route("POST", "/v1/trainer/codes/:code/revoke", async (ctx) => {
    await requireTrainer(ctx);
    if (!(await store.revokeCode(normalizeCode(decodeURIComponent(ctx.params.code!)), ctx.now))) throw new HttpError(404, "NOT_FOUND", "No active code with that value.");
    return { ok: true };
  });

  const learnerReports = async (cohortId: string) => {
    const learners = await store.listLearners(cohortId);
    return Promise.all(
      learners.map(async (l) => {
        const [events, rejected] = await Promise.all([store.listEvents(l.learner_id), store.listRejected(l.learner_id)]);
        const report = buildLearnerReport(
          { learner_id: l.learner_id, name: l.name, username: l.username, cohort_id: l.cohort_id },
          events,
          rejected.map((r) => ({ event_id: r.event_id, code: r.code, message: r.message, received_at: r.received_at })),
          content.library,
          { thresholds: config.thresholds, activeTime: config.activeTime },
        );
        return { report, events, rejected };
      }),
    );
  };

  route("GET", "/v1/trainer/cohorts/:id/report", async (ctx) => {
    await requireTrainer(ctx);
    const cohort = await requireCohort(ctx.params.id!);
    const rows = await learnerReports(cohort.cohort_id);
    return { cohort, generated_at: ctx.now, thresholds: config.thresholds, active_time: config.activeTime, learners: rows.map((r) => r.report) };
  });

  route("GET", "/v1/trainer/cohorts/:id/export", async (ctx) => {
    await requireTrainer(ctx);
    const cohort = await requireCohort(ctx.params.id!);
    const rows = await learnerReports(cohort.cohort_id);
    ctx.res.setHeader("content-disposition", `attachment; filename="tetherless-${cohort.cohort_id}-${ctx.now.slice(0, 10)}.json"`);
    return {
      export_version: 1,
      cohort,
      generated_at: ctx.now,
      thresholds: config.thresholds,
      active_time: config.activeTime,
      content_versions: content.modules.map((m) => ({ module_id: m.module_id, content_version: m.content_version })),
      note: "accepted_events are server-acknowledged. rejected_events were received but not accepted; they are kept for review and never counted.",
      learners: rows.map((r) => ({ ...r.report, accepted_events: r.events, rejected_events: r.rejected })),
    };
  });

  route("POST", "/v1/trainer/learners/:id/relink", async (ctx) => {
    await requireTrainer(ctx);
    const learner = isUuid(ctx.params.id) ? await store.getLearner(ctx.params.id!) : undefined;
    if (!learner) throw new HttpError(404, "NOT_FOUND", "Learner not found.");
    const expires = new Date(Date.parse(ctx.now) + 24 * 3600_000).toISOString();
    for (let tries = 0; tries < 5; tries++) {
      const code = newShortCode();
      if (await store.createCode({ code, kind: "relink", cohort_id: learner.cohort_id, learner_id: learner.learner_id, expires_at: expires, revoked_at: null, max_uses: 1, uses: 0 })) {
        ctx.res.statusCode = 201;
        return { relink_code: code, expires_at: expires, username: learner.username };
      }
    }
    throw new HttpError(500, "SERVER_ERROR", "Could not generate a unique code.");
  });

  route("POST", "/v1/trainer/devices/:id/revoke", async (ctx) => {
    await requireTrainer(ctx);
    if (!isUuid(ctx.params.id) || !(await store.revokeDevice(ctx.params.id!.toLowerCase(), ctx.now))) throw new HttpError(404, "NOT_FOUND", "No active device with that ID.");
    return { ok: true };
  });

  // ------------------------------------------------------------ dispatch

  return async function handle(req: IncomingMessage, res: ServerResponse) {
    const origin = req.headers.origin;
    const cors: Record<string, string> = {};
    if (origin && config.corsOrigins.includes(origin)) {
      cors["access-control-allow-origin"] = origin;
      cors["vary"] = "Origin";
      cors["access-control-allow-headers"] = "authorization, content-type";
      cors["access-control-allow-methods"] = "GET, POST, OPTIONS";
      cors["access-control-max-age"] = "600";
    }
    for (const [k, v] of Object.entries(cors)) res.setHeader(k, v);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    const now = clock().toISOString();
    try {
      for (const r of routes) {
        const m = r.pattern.exec(path);
        if (!m) continue;
        if (r.method !== req.method) continue;
        const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1]!)]));
        const body = await r.handler({ req, res, params, now });
        send(res, res.statusCode && res.statusCode !== 200 ? res.statusCode : 200, body);
        return;
      }
      const pathExists = routes.some((r) => r.pattern.test(path));
      throw new HttpError(pathExists ? 405 : 404, pathExists ? "METHOD_NOT_ALLOWED" : "NOT_FOUND", pathExists ? "Method not allowed." : "Not found.");
    } catch (e) {
      if (e instanceof HttpError) {
        send(res, e.status, { error: { code: e.code, message: e.message } }, e.headers);
      } else {
        console.error(e);
        send(res, 500, { error: { code: "SERVER_ERROR", message: "Something went wrong on the server. Try again later." } });
      }
    }
  };
}
