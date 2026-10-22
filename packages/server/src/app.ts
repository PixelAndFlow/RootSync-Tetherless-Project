/**
 * HTTP API (node:http, no framework). Spec: API and Integration Spec v1.10.
 *
 * Learner (device token; Naquan's gateway):
 *   POST /v1/setup                                   one-time setup code + username → device token
 *   POST /v1/sync/events                             per-event results
 *   GET  /v1/me/modules                              modules assigned to this learner
 *   GET  /v1/content/modules/:module/versions/:v     module JSON (device or staff token)
 *
 * Staff (staff token; Chris's TrainerDataGateway and StaffAdminGateway): see
 * staff-routes.ts. Everything is under /v1/staff/ and checked by permission.
 *
 * See packages/contract/openapi.yaml for request and response shapes.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { isUuid, MAX_EVENTS_PER_BATCH, normalizeUsername, SCHEMA_VERSION } from "../../contract/src/index.ts";
import { DEFAULT_THRESHOLDS, type Thresholds } from "../../analytics/src/index.ts";
import type { Config } from "./config.ts";
import type { ContentRegistry } from "./content.ts";
import { bearer, HttpError, isRecord, readJson, Router, type Ctx } from "./http.ts";
import { ingestBatch } from "./ingest.ts";
import { DEFAULT_ROLE_PERMISSIONS, ROLES, type Permission, type Role } from "./permissions.ts";
import { RateLimiter } from "./rate-limit.ts";
import { hashSetupCode, hashToken, newToken } from "./security.ts";
import { registerStaffRoutes } from "./staff-routes.ts";
import type { Device, Learner, Staff, Store } from "./store.ts";

export { HttpError } from "./http.ts";

export interface AppDeps {
  store: Store;
  content: ContentRegistry;
  config: Config;
  /** Injectable clock for tests. */
  clock?: () => Date;
}

/** What route modules share. */
export interface Env {
  store: Store;
  content: ContentRegistry;
  config: Config;
  router: Router;
  limitAuth(ctx: Ctx): void;
  /** Signed-in staff member with their permissions; checks `permission` when given. */
  requireStaff(ctx: Ctx, permission?: Permission | null, opts?: { allowPasswordChange?: boolean }): Promise<{ staff: Staff; permissions: string[] }>;
  rolePermissions(): Promise<Record<Role, string[]>>;
  thresholds(): Promise<Thresholds>;
}

export function createApp(deps: AppDeps) {
  const { store, content, config } = deps;
  const clock = deps.clock ?? (() => new Date());
  const authLimiter = new RateLimiter(config.authRateLimitPerMinute, 60_000);
  const router = new Router();

  const clientAddress = (req: IncomingMessage) =>
    (config.trustProxy ? String(req.headers["x-forwarded-for"] ?? "").split(",")[0]?.trim() : "") || req.socket.remoteAddress || "unknown";

  const limitAuth = (ctx: Ctx) => {
    const wait = authLimiter.take(clientAddress(ctx.req), Date.parse(ctx.now));
    if (wait > 0) throw new HttpError(429, "RATE_LIMITED", "Too many attempts. Wait a minute and try again.", { headers: { "retry-after": String(Math.ceil(wait / 1000)) } });
  };

  /** Role permissions, seeded with the Demo Day defaults the first time they're read. */
  const rolePermissions = async (): Promise<Record<Role, string[]>> => {
    const stored = await store.getRolePermissions();
    const out = {} as Record<Role, string[]>;
    for (const role of ROLES) {
      if (!stored[role]) await store.setRolePermissions(role, DEFAULT_ROLE_PERMISSIONS[role]);
      out[role] = stored[role] ?? [...DEFAULT_ROLE_PERMISSIONS[role]];
    }
    return out;
  };

  const requireStaff: Env["requireStaff"] = async (ctx, permission, opts = {}) => {
    const token = bearer(ctx.req);
    const staff = token ? await store.getStaffSession(hashToken(token), ctx.now) : undefined;
    if (!staff) throw new HttpError(401, "UNAUTHORIZED", "Sign in to see this.");
    const permissions = (await rolePermissions())[staff.role] ?? [];
    if (staff.must_change_password && !opts.allowPasswordChange) {
      throw new HttpError(403, "PASSWORD_CHANGE_REQUIRED", "Choose a new password before continuing (POST /v1/staff/me/password).");
    }
    if (permission && !permissions.includes(permission)) throw new HttpError(403, "FORBIDDEN", "You don't have access to this.");
    return { staff, permissions };
  };

  const thresholds = async (): Promise<Thresholds> => ({ ...DEFAULT_THRESHOLDS, ...config.thresholds, ...((await store.getSetting<Partial<Thresholds>>("thresholds")) ?? {}) });

  /** The device signed in with this request's token, and its learner. */
  const requireDevice = async (ctx: Ctx, message = "This phone's sign-in is not valid. Your work is still saved on the phone."): Promise<{ device: Device; learner: Learner }> => {
    const token = bearer(ctx.req);
    const device = token ? await store.getDeviceByTokenHash(hashToken(token)) : undefined;
    const learner = device && !device.revoked_at ? await store.getLearner(device.learner_id) : undefined;
    if (!device || !learner || learner.archived_at) throw new HttpError(401, "UNAUTHORIZED", message);
    return { device, learner };
  };

  // ------------------------------------------------------------ public

  router.add("GET", "/healthz", async () => ({ ok: true, modules: content.count }));

  // ------------------------------------------------------------ learner (device)

  router.add("POST", "/v1/setup", async (ctx) => {
    limitAuth(ctx);
    const body = await readJson(ctx.req);
    if (!isRecord(body)) throw new HttpError(400, "INVALID_INPUT", "Send a JSON object.");
    const code = typeof body.setup_code === "string" ? body.setup_code : "";
    const username = normalizeUsername(body.username);
    const deviceId = typeof body.device_id === "string" ? body.device_id.toLowerCase() : "";
    if (!username) throw new HttpError(422, "USERNAME_INVALID", "Usernames need 2 to 24 characters: letters, numbers, spaces, dots, dashes or underscores.");
    if (!isUuid(deviceId)) throw new HttpError(400, "INVALID_INPUT", "device_id must be a UUID created on the phone.");
    if (!code.trim()) throw new HttpError(422, "SETUP_CODE_INVALID", "That code isn't right. Check it with your trainer.");

    const token = newToken();
    const result = await store.useSetupCode({ code_hash: hashSetupCode(code), now: ctx.now, username, device: { device_id: deviceId, token_hash: hashToken(token) } });
    if (!result.ok) {
      if (result.reason === "CODE_USED") throw new HttpError(409, "SETUP_CODE_USED", "That code has already been used. Ask your trainer for a new one.");
      if (result.reason === "DEVICE_EXISTS") throw new HttpError(409, "DEVICE_EXISTS", "This phone is already set up. Reinstalling the app gives it a new ID.");
      throw new HttpError(422, "SETUP_CODE_INVALID", "That code isn't right. Check it with your trainer.");
    }
    ctx.res.statusCode = 201;
    return {
      device_token: token,
      learner: { learner_id: result.learner.learner_id, learner_code: result.learner.learner_code, username: result.learner.username, cohort_name: result.cohort.name },
    };
  });

  router.add("POST", "/v1/sync/events", async (ctx) => {
    // Authenticate before reading or storing anything.
    const { device } = await requireDevice(ctx);
    const body = await readJson(ctx.req);
    if (!isRecord(body) || !Array.isArray(body.events)) throw new HttpError(400, "INVALID_INPUT", "Send { schema_version, events: [...] }.");
    if (body.schema_version !== SCHEMA_VERSION) throw new HttpError(400, "UNSUPPORTED_SCHEMA_VERSION", `schema_version must be ${SCHEMA_VERSION}.`);
    if (body.events.length > MAX_EVENTS_PER_BATCH) throw new HttpError(413, "TOO_MANY_EVENTS", `Send at most ${MAX_EVENTS_PER_BATCH} events per request.`);
    const results = await ingestBatch(body.events, device, store, content.library, ctx.now);
    return { schema_version: SCHEMA_VERSION, received_at: ctx.now, results };
  });

  router.add("GET", "/v1/me/modules", async (ctx) => {
    const { learner } = await requireDevice(ctx);
    const assignments = await store.listAssignmentsForLearner(learner.learner_id, learner.cohort_id);
    const archived = new Set((await store.listModules(true)).filter((m) => m.archived_at).map((m) => m.module_id));
    const chosen = new Map<string, { version: number; assigned_at: string }>();
    for (const a of assignments) {
      if (archived.has(a.module_id)) continue;
      const version = a.content_version ?? content.library.latest(a.module_id)?.content_version;
      if (!version || !content.body(a.module_id, version)) continue;
      const prev = chosen.get(a.module_id);
      if (!prev || version > prev.version) chosen.set(a.module_id, { version, assigned_at: a.created_at });
    }
    return {
      modules: [...chosen.entries()]
        .map(([id, c]) => {
          const b = content.body(id, c.version)!;
          return { module_id: id, content_version: c.version, title: b.title, level: b.level, activity_type: b.activity_type ?? "multiple_choice", question_count: b.questions.length, assigned_at: c.assigned_at };
        })
        .sort((a, b) => a.assigned_at.localeCompare(b.assigned_at) || a.module_id.localeCompare(b.module_id)),
    };
  });

  router.add("GET", "/v1/content/modules/:module/versions/:version", async (ctx) => {
    // Phones (device token) and staff (staff token) may download a published version.
    const token = bearer(ctx.req);
    const device = token ? await store.getDeviceByTokenHash(hashToken(token)) : undefined;
    if (!device || device.revoked_at) await requireStaff(ctx, "results.view");
    const body = content.body(ctx.params.module!, Number(ctx.params.version));
    if (!body) throw new HttpError(404, "NOT_FOUND", "That module version is not published.");
    return body;
  });

  // ------------------------------------------------------------ staff

  registerStaffRoutes({ store, content, config, router, limitAuth, requireStaff, rolePermissions, thresholds });

  // ------------------------------------------------------------ dispatch

  return async function handle(req: IncomingMessage, res: ServerResponse) {
    const origin = req.headers.origin;
    if (origin && config.corsOrigins.includes(origin)) {
      res.setHeader("access-control-allow-origin", origin);
      res.setHeader("vary", "Origin");
      res.setHeader("access-control-allow-headers", "authorization, content-type");
      res.setHeader("access-control-allow-methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
      res.setHeader("access-control-expose-headers", "content-disposition, x-request-id, retry-after");
      res.setHeader("access-control-max-age", "600");
    }
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    await router.dispatch(req, res, clock().toISOString());
  };
}
