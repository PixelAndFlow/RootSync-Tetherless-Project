/**
 * Staff API (spec v1.10 §8–§9). Every route checks a permission, never a
 * role name (permissions.ts). Archive replaces delete; the only permanent
 * deletes need "data.purge" (Superadmin).
 *
 *   POST /v1/staff/login | /logout          GET /v1/staff/me      POST /v1/staff/me/password
 *   GET|POST /v1/staff/cohorts              PATCH /v1/staff/cohorts/:id      POST /v1/staff/cohorts/:id/archive
 *   GET|POST /v1/staff/learners             GET|PATCH /v1/staff/learners/:id
 *   POST /v1/staff/learners/:id/archive     POST /v1/staff/learners/:id/setup-code
 *   POST /v1/staff/learners/:id/devices/:deviceId/switch-off
 *   POST /v1/staff/learners/:id/purge       (privacy request; Superadmin)
 *   POST /v1/staff/learners/import/check    POST /v1/staff/learners/import/:importId/commit
 *   POST /v1/staff/modules/check            GET|POST /v1/staff/modules
 *   GET /v1/staff/modules/:id/versions/:v   POST /v1/staff/modules/:id/archive   DELETE /v1/staff/modules/:id
 *   GET|POST /v1/staff/assignments          POST /v1/staff/assignments/:id/remove
 *   GET /v1/staff/cohorts/:id/report        GET /v1/staff/learners/:id/report
 *   GET /v1/staff/cohorts/:id/modules/:moduleId/summary
 *   GET /v1/staff/cohorts/:id/export
 *   GET|POST /v1/staff/accounts             POST /v1/staff/accounts/:id/disable | /enable
 *   GET /v1/staff/roles                     PUT /v1/staff/roles/:role/permissions
 *   GET|PUT /v1/staff/settings/thresholds
 */

import { randomUUID } from "node:crypto";
import { isUuid, STAFF_USERNAME_PATTERN } from "../../contract/src/index.ts";
import type {
  Assignment as AssignmentApi,
  Cohort as CohortApi,
  CohortModuleSummary,
  CohortReport,
  LearnerReport,
  LearnerReportRow,
  ModuleListing,
  StaffAccount,
} from "../../contract/src/staff-api.ts";
import { buildLearnerReport, statusLabel, type ModuleResult, type Thresholds } from "../../analytics/src/index.ts";
import { checkNewVersion, validateTetherlessModule, type Issue, type TetherlessModule } from "../../content/src/index.ts";
import type { Env } from "./app.ts";
import { HttpError, isRecord, readBody, readJson, text, type Ctx, type ErrorDetail } from "./http.ts";
import { checkLearnerFields, staffLearnerView } from "./learners.ts";
import { isPermission, isRole, PERMISSIONS, permissionToManage, type Permission } from "./permissions.ts";
import { checkRoster, MAX_ROSTER_BYTES, parseMultipart } from "./roster.ts";
import { hashPassword, hashSetupCode, hashToken, newLearnerCode, newSetupCode, newToken, verifyPassword } from "./security.ts";
import type { Cohort, Learner, LearnerFields, Staff } from "./store.ts";

export const MIN_PASSWORD_LENGTH = 12;
const MAX_MODULE_BYTES = 1024 * 1024;
const ROSTER_IMPORT_TTL_MS = 3600_000;

const staffView = (s: Staff, permissions?: string[]) =>
  ({
    staff_id: s.staff_id,
    username: s.username,
    display_name: s.display_name,
    role: s.role,
    must_change_password: s.must_change_password,
    disabled: !!s.disabled_at,
    created_at: s.created_at,
    created_by: s.created_by,
    ...(permissions ? { permissions } : {}),
  }) satisfies StaffAccount;

const cohortView = (c: Cohort & { learners?: number }) =>
  ({
    cohort_id: c.cohort_id,
    name: c.name,
    ...(c.learners !== undefined ? { learner_count: c.learners } : {}),
    created_at: c.created_at,
    created_by: c.created_by,
    archived: !!c.archived_at,
  }) satisfies CohortApi;

const issueDetails = (issues: Issue[]): ErrorDetail[] =>
  issues.map((i) => ({ ...(i.location?.row !== undefined ? { row: i.location.row } : {}), ...(i.location?.field ? { field: i.location.field } : {}), code: i.code, message: i.message }));

const bodyObject = async (ctx: Ctx, limit?: number): Promise<Record<string, unknown>> => {
  const body = await readJson(ctx.req, limit);
  if (!isRecord(body)) throw new HttpError(400, "INVALID_INPUT", "Send a JSON object.");
  return body;
};

const avg = (xs: number[]): number | null => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

export function registerStaffRoutes(env: Env): void {
  const { store, content, config, router, requireStaff } = env;

  // ------------------------------------------------------------ lookups

  const requireCohort = async (id: string | undefined, opts: { active?: boolean } = {}): Promise<Cohort> => {
    const cohort = id && isUuid(id) ? await store.getCohort(id) : undefined;
    if (!cohort) throw new HttpError(404, "NOT_FOUND", "Cohort not found.");
    if (opts.active && cohort.archived_at) throw new HttpError(409, "COHORT_ARCHIVED", "This cohort is archived.");
    return cohort;
  };
  const requireLearner = async (id: string | undefined): Promise<Learner> => {
    const learner = id && isUuid(id) ? await store.getLearner(id.toLowerCase()) : undefined;
    if (!learner) throw new HttpError(404, "NOT_FOUND", "Learner not found.");
    return learner;
  };

  const issueSetupCode = async (learnerId: string, staffId: string, now: string): Promise<string> => {
    const code = newSetupCode();
    await store.addSetupCode({ code_hash: hashSetupCode(code), learner_id: learnerId, created_by: staffId, created_at: now });
    return code;
  };

  const createLearner = async (cohort: Cohort, fields: LearnerFields, staffId: string, now: string): Promise<{ learner: Learner; setup_code: string }> => {
    for (let tries = 0; tries < 8; tries++) {
      const learner: Learner = { learner_id: randomUUID(), cohort_id: cohort.cohort_id, learner_code: newLearnerCode(cohort.name), username: null, ...fields, created_at: now, created_by: staffId, archived_at: null };
      if (await store.createLearner(learner)) return { learner, setup_code: await issueSetupCode(learner.learner_id, staffId, now) };
    }
    throw new HttpError(500, "SERVER_ERROR", "Could not generate a unique learner code.");
  };

  // ------------------------------------------------------------ session

  router.add("POST", "/v1/staff/login", async (ctx) => {
    env.limitAuth(ctx);
    const body = await readJson(ctx.req);
    const username = isRecord(body) && typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
    const password = isRecord(body) && typeof body.password === "string" ? body.password : "";
    const staff = username ? await store.getStaffByUsername(username) : undefined;
    if (!staff || !(await verifyPassword(password, staff.password_hash))) throw new HttpError(401, "INVALID_CREDENTIALS", "Username or password is wrong.");
    if (staff.disabled_at) throw new HttpError(403, "ACCOUNT_DISABLED", "This account is disabled. Ask an administrator.");
    const token = newToken();
    const expires = new Date(Date.parse(ctx.now) + config.staffSessionHours * 3600_000).toISOString();
    await store.createStaffSession(hashToken(token), staff.staff_id, expires);
    return { token, expires_at: expires, staff: staffView(staff, (await env.rolePermissions())[staff.role]) };
  });

  router.add("POST", "/v1/staff/logout", async (ctx) => {
    await requireStaff(ctx, null, { allowPasswordChange: true });
    await store.deleteStaffSession(hashToken(ctx.req.headers.authorization!.replace(/^Bearer\s+/i, "")));
    return { ok: true };
  });

  router.add("GET", "/v1/staff/me", async (ctx) => {
    const { staff, permissions } = await requireStaff(ctx, null, { allowPasswordChange: true });
    return staffView(staff, permissions);
  });

  router.add("POST", "/v1/staff/me/password", async (ctx) => {
    const { staff } = await requireStaff(ctx, null, { allowPasswordChange: true });
    env.limitAuth(ctx);
    const body = await bodyObject(ctx);
    const current = typeof body.current_password === "string" ? body.current_password : "";
    const next = typeof body.new_password === "string" ? body.new_password : "";
    if (!(await verifyPassword(current, staff.password_hash))) throw new HttpError(401, "INVALID_CREDENTIALS", "Your current password is wrong.");
    if (next.length < MIN_PASSWORD_LENGTH) throw new HttpError(422, "PASSWORD_TOO_SHORT", `Use at least ${MIN_PASSWORD_LENGTH} characters.`);
    if (next === current) throw new HttpError(422, "PASSWORD_UNCHANGED", "Choose a different password.");
    await store.updateStaff(staff.staff_id, { password_hash: await hashPassword(next), must_change_password: false });
    return { ok: true };
  });

  // ------------------------------------------------------------ cohorts

  router.add("GET", "/v1/staff/cohorts", async (ctx) => {
    await requireStaff(ctx, "results.view");
    return { cohorts: (await store.listCohorts(ctx.query.get("include_archived") === "true")).map(cohortView) };
  });

  router.add("POST", "/v1/staff/cohorts", async (ctx) => {
    const { staff } = await requireStaff(ctx, "cohort.create");
    const body = await bodyObject(ctx);
    const name = text(body.name, 120);
    if (!name) throw new HttpError(422, "NAME_INVALID", "Give the cohort a name (up to 120 characters).");
    const cohort: Cohort = { cohort_id: randomUUID(), name, created_at: ctx.now, created_by: staff.staff_id, archived_at: null };
    if (!(await store.createCohort(cohort))) throw new HttpError(409, "COHORT_NAME_TAKEN", "A cohort with that name already exists.");
    ctx.res.statusCode = 201;
    return { cohort: cohortView({ ...cohort, learners: 0 }) };
  });

  router.add("PATCH", "/v1/staff/cohorts/:id", async (ctx) => {
    await requireStaff(ctx, "cohort.edit");
    const cohort = await requireCohort(ctx.params.id);
    const body = await bodyObject(ctx);
    const name = text(body.name, 120);
    if (!name) throw new HttpError(422, "NAME_INVALID", "Give the cohort a name (up to 120 characters).");
    const r = await store.updateCohort(cohort.cohort_id, { name });
    if (r === "name_taken") throw new HttpError(409, "COHORT_NAME_TAKEN", "A cohort with that name already exists.");
    // Learner codes keep the name they were created with (spec v1.10 §9.2).
    return { cohort: cohortView((await store.getCohort(cohort.cohort_id))!) };
  });

  router.add("POST", "/v1/staff/cohorts/:id/archive", async (ctx) => {
    await requireStaff(ctx, "cohort.archive");
    const cohort = await requireCohort(ctx.params.id);
    if (!cohort.archived_at) await store.updateCohort(cohort.cohort_id, { archived_at: ctx.now });
    return { ok: true };
  });

  // ------------------------------------------------------------ learners

  router.add("GET", "/v1/staff/learners", async (ctx) => {
    await requireStaff(ctx, "results.view");
    const cohort = await requireCohort(ctx.query.get("cohort_id") ?? undefined);
    const search = ctx.query.get("q")?.trim() || undefined;
    const learners = await store.listLearners(cohort.cohort_id, { includeArchived: ctx.query.get("include_archived") === "true", search });
    const synced = await store.lastSyncedByCohort(cohort.cohort_id);
    return {
      learners: await Promise.all(learners.map(async (l) => staffLearnerView(l, await store.listDevices(l.learner_id), { last_synced_at: synced.get(l.learner_id) ?? null }))),
    };
  });

  router.add("GET", "/v1/staff/learners/:id", async (ctx) => {
    await requireStaff(ctx, "results.view");
    const learner = await requireLearner(ctx.params.id);
    const cohort = (await store.getCohort(learner.cohort_id))!;
    const synced = await store.lastSyncedByCohort(cohort.cohort_id);
    return staffLearnerView(learner, await store.listDevices(learner.learner_id), { cohort_name: cohort.name, last_synced_at: synced.get(learner.learner_id) ?? null, includeDevices: true });
  });

  router.add("POST", "/v1/staff/learners", async (ctx) => {
    const { staff } = await requireStaff(ctx, "learner.create");
    const body = await bodyObject(ctx);
    const cohort = await requireCohort(typeof body.cohort_id === "string" ? body.cohort_id : undefined, { active: true });
    const { value, errors } = checkLearnerFields(body, { partial: false });
    if (errors.length) throw new HttpError(422, "VALIDATION_FAILED", "Some fields need fixing.", { details: errors });
    const { learner, setup_code } = await createLearner(cohort, value as LearnerFields, staff.staff_id, ctx.now);
    ctx.res.statusCode = 201;
    return { learner: staffLearnerView(learner, [], { cohort_name: cohort.name }), setup_code };
  });

  router.add("PATCH", "/v1/staff/learners/:id", async (ctx) => {
    await requireStaff(ctx, "learner.edit");
    const learner = await requireLearner(ctx.params.id);
    const body = await bodyObject(ctx);
    for (const k of ["cohort_id", "learner_code", "username", "learner_id"]) {
      if (k in body) throw new HttpError(422, "READ_ONLY_FIELD", `${k} can't be changed here.`);
    }
    const { value, errors } = checkLearnerFields(body, { partial: true });
    if (errors.length) throw new HttpError(422, "VALIDATION_FAILED", "Some fields need fixing.", { details: errors });
    await store.updateLearner(learner.learner_id, value);
    const updated = (await store.getLearner(learner.learner_id))!;
    return staffLearnerView(updated, await store.listDevices(learner.learner_id), { includeDevices: true });
  });

  router.add("POST", "/v1/staff/learners/:id/archive", async (ctx) => {
    await requireStaff(ctx, "learner.archive");
    const learner = await requireLearner(ctx.params.id);
    if (!learner.archived_at) {
      await store.updateLearner(learner.learner_id, { archived_at: ctx.now });
      await store.revokeDevicesForLearner(learner.learner_id, ctx.now);
    }
    return { ok: true };
  });

  router.add("POST", "/v1/staff/learners/:id/setup-code", async (ctx) => {
    const { staff } = await requireStaff(ctx, "learner.setup_code");
    const learner = await requireLearner(ctx.params.id);
    if (learner.archived_at) throw new HttpError(409, "LEARNER_ARCHIVED", "This learner is archived.");
    const body = await bodyObject(ctx);
    let switchedOff = 0;
    if (body.switch_off_existing_phones === true) {
      const { permissions } = await requireStaff(ctx, null);
      if (!permissions.includes("device.revoke")) throw new HttpError(403, "FORBIDDEN", "You don't have access to switch off phones.");
      switchedOff = await store.revokeDevicesForLearner(learner.learner_id, ctx.now);
    }
    const setup_code = await issueSetupCode(learner.learner_id, staff.staff_id, ctx.now);
    ctx.res.statusCode = 201;
    return { setup_code, phones_switched_off: switchedOff };
  });

  router.add("POST", "/v1/staff/learners/:id/devices/:deviceId/switch-off", async (ctx) => {
    await requireStaff(ctx, "device.revoke");
    const learner = await requireLearner(ctx.params.id);
    const deviceId = (ctx.params.deviceId ?? "").toLowerCase();
    if (!isUuid(deviceId) || !(await store.revokeDevice(learner.learner_id, deviceId, ctx.now))) throw new HttpError(404, "NOT_FOUND", "No active phone with that ID for this learner.");
    return { ok: true };
  });

  router.add("POST", "/v1/staff/learners/:id/purge", async (ctx) => {
    const { staff } = await requireStaff(ctx, "data.purge");
    const learner = await requireLearner(ctx.params.id);
    const body = await bodyObject(ctx);
    if (body.confirm !== learner.learner_code) throw new HttpError(422, "CONFIRMATION_REQUIRED", `To permanently delete this learner and all their data, send { "confirm": "${learner.learner_code}" }.`);
    const events = (await store.listEvents(learner.learner_id)).length;
    await store.purgeLearner(learner.learner_id);
    await store.addAudit({ staff_id: staff.staff_id, action: "learner.purge", target: learner.learner_code, detail: { learner_id: learner.learner_id, events_deleted: events }, at: ctx.now });
    return { ok: true, events_deleted: events };
  });

  // ------------------------------------------------------------ roster import

  router.add("POST", "/v1/staff/learners/import/check", async (ctx) => {
    const { staff } = await requireStaff(ctx, "learner.import");
    const { fields, files } = parseMultipart(await readBody(ctx.req, MAX_ROSTER_BYTES + 64 * 1024), ctx.req.headers["content-type"]);
    const cohort = await requireCohort(fields.cohort_id?.trim(), { active: true });
    const file = files.file;
    if (!file || !file.data.length) throw new HttpError(400, "INVALID_INPUT", "Attach the roster as a 'file' field (.csv or .xlsx).");
    const check = checkRoster(file);
    const importId = randomUUID();
    const valid = check.errors.length === 0;
    await store.saveRosterImport({ import_id: importId, cohort_id: cohort.cohort_id, valid, rows: valid ? check.rows : [], created_by: staff.staff_id, expires_at: new Date(Date.parse(ctx.now) + ROSTER_IMPORT_TTL_MS).toISOString() });
    return { import_id: importId, cohort_id: cohort.cohort_id, valid, rows_total: check.rows_total, rows_ok: check.rows_ok, errors: check.errors, warnings: check.warnings, preview: check.rows.slice(0, 20) };
  });

  router.add("POST", "/v1/staff/learners/import/:importId/commit", async (ctx) => {
    const { staff } = await requireStaff(ctx, "learner.import");
    const id = ctx.params.importId ?? "";
    const imp = isUuid(id) ? await store.getRosterImport(id, ctx.now) : undefined;
    if (!imp) throw new HttpError(404, "IMPORT_NOT_FOUND", "That import wasn't found or has expired. Check the file again.");
    if (!imp.valid) throw new HttpError(422, "IMPORT_INVALID", "This file had problems. Fix them and check the file again.");
    const cohort = await requireCohort(imp.cohort_id, { active: true });
    await store.deleteRosterImport(imp.import_id); // one commit per check, even if two requests race
    const created = [];
    for (const row of imp.rows) {
      const { learner, setup_code } = await createLearner(cohort, row, staff.staff_id, ctx.now);
      created.push({ learner_id: learner.learner_id, learner_code: learner.learner_code, first_name: learner.first_name, last_name: learner.last_name, setup_code });
    }
    ctx.res.statusCode = 201;
    return { created: created.length, learners: created };
  });

  // ------------------------------------------------------------ modules

  const latestBody = (moduleId: string): TetherlessModule | undefined => content.latestBody(moduleId);

  const checkModule = async (input: unknown) => {
    const issues = validateTetherlessModule(input);
    let willBe: "new_module" | "new_version" | "blocked" = "new_module";
    if (!issues.some((i) => i.severity === "error")) {
      const m = input as TetherlessModule;
      const existing = await store.getModule(m.module_id);
      if (existing) {
        willBe = "new_version";
        if (existing.archived_at) issues.push({ severity: "error", code: "MODULE_ARCHIVED", message: `Module ${m.module_id} is archived.`, location: { field: "module_id" } });
        if ((m.activity_type ?? "multiple_choice") !== existing.activity_type) {
          issues.push({ severity: "error", code: "ACTIVITY_TYPE_CHANGED", message: `Module ${m.module_id} is ${existing.activity_type}; a new version can't change that.`, location: { field: "activity_type" } });
        }
        issues.push(...checkNewVersion(m, latestBody(m.module_id)));
      }
    }
    const errors = issues.filter((i) => i.severity === "error");
    if (errors.length) willBe = "blocked";
    const m = isRecord(input) ? input : {};
    return {
      valid: errors.length === 0,
      will_be: willBe,
      summary: {
        module_id: m.module_id ?? null,
        module_name: isRecord(m.title) ? (m.title.en ?? null) : null,
        content_version: m.content_version ?? null,
        level: m.level ?? null,
        activity_type: m.activity_type ?? "multiple_choice",
        question_count: Array.isArray(m.questions) ? m.questions.length : 0,
      },
      errors: issueDetails(errors),
      warnings: issueDetails(issues.filter((i) => i.severity !== "error")),
    };
  };

  router.add("POST", "/v1/staff/modules/check", async (ctx) => {
    await requireStaff(ctx, "content.create");
    return checkModule(await readJson(ctx.req, MAX_MODULE_BYTES));
  });

  router.add("POST", "/v1/staff/modules", async (ctx) => {
    const input = await readJson(ctx.req, MAX_MODULE_BYTES);
    const exists = isRecord(input) && typeof input.module_id === "string" && !!(await store.getModule(input.module_id));
    const { staff } = await requireStaff(ctx, exists ? "content.edit" : "content.create");
    const check = await checkModule(input);
    if (!check.valid) {
      const versionClash = check.errors.find((e) => e.code === "VERSION_NOT_HIGHER");
      if (versionClash) throw new HttpError(409, "VERSION_EXISTS", versionClash.message, { details: check.errors });
      throw new HttpError(422, "VALIDATION_FAILED", "The module has problems. Fix them and try again.", { details: check.errors });
    }
    const m = input as TetherlessModule;
    const r = await store.publishModuleVersion(
      { module_id: m.module_id, activity_type: m.activity_type ?? "multiple_choice", created_by: staff.staff_id, created_at: ctx.now, archived_at: null },
      { module_id: m.module_id, content_version: m.content_version, body: m, published_by: staff.staff_id, published_at: ctx.now },
    );
    if (r === "version_exists") throw new HttpError(409, "VERSION_EXISTS", `Version ${m.content_version} of ${m.module_id} is already published.`);
    await content.reload();
    ctx.res.statusCode = 201;
    return { module_id: m.module_id, content_version: m.content_version, published_at: ctx.now, warnings: check.warnings };
  });

  router.add("GET", "/v1/staff/modules", async (ctx) => {
    await requireStaff(ctx, "results.view");
    const rows = await store.listModules(ctx.query.get("include_archived") === "true");
    return {
      modules: await Promise.all(
        rows.map(async (row) => {
          const body = latestBody(row.module_id);
          return {
            module_id: row.module_id,
            module_name: body?.title.en ?? row.module_id,
            title: body?.title ?? null,
            level: body?.level ?? null,
            note: body?.note ?? null,
            activity_type: row.activity_type,
            latest_version: body?.content_version ?? null,
            versions: content.versions(row.module_id),
            question_count: body?.questions.length ?? 0,
            used: (await store.moduleHasEvents(row.module_id)) || (await store.moduleHasAssignments(row.module_id)),
            archived: !!row.archived_at,
            created_by: row.created_by,
            created_at: row.created_at,
          } satisfies ModuleListing;
        }),
      ),
    };
  });

  router.add("GET", "/v1/staff/modules/:id/versions/:version", async (ctx) => {
    await requireStaff(ctx, "results.view");
    const body = content.body(ctx.params.id!, Number(ctx.params.version));
    if (!body) throw new HttpError(404, "NOT_FOUND", "That module version is not published.");
    return body;
  });

  router.add("POST", "/v1/staff/modules/:id/archive", async (ctx) => {
    await requireStaff(ctx, "content.archive");
    if (!(await store.getModule(ctx.params.id!))) throw new HttpError(404, "NOT_FOUND", "Module not found.");
    await store.archiveModule(ctx.params.id!, ctx.now);
    return { ok: true };
  });

  router.add("DELETE", "/v1/staff/modules/:id", async (ctx) => {
    const { staff } = await requireStaff(ctx, "data.purge");
    const id = ctx.params.id!;
    if (!(await store.getModule(id))) throw new HttpError(404, "NOT_FOUND", "Module not found.");
    if ((await store.moduleHasEvents(id)) || (await store.moduleHasAssignments(id))) {
      throw new HttpError(409, "IN_USE", "Learners have used or been assigned this module. Archive it instead; its history must stay.");
    }
    await store.deleteModule(id);
    await store.addAudit({ staff_id: staff.staff_id, action: "module.purge", target: id, detail: null, at: ctx.now });
    await content.reload();
    return { ok: true };
  });

  // ------------------------------------------------------------ assignments

  const assignmentView = (a: { assignment_id: string; module_id: string; content_version: number | null; cohort_id: string | null; learner_id: string | null; created_at: string; created_by: string | null }) =>
    ({
      assignment_id: a.assignment_id,
      module_id: a.module_id,
      module_name: latestBody(a.module_id)?.title.en ?? a.module_id,
      content_version: a.content_version,
      target: a.cohort_id ? "cohort" : "learner",
      cohort_id: a.cohort_id,
      learner_id: a.learner_id,
      created_at: a.created_at,
      created_by: a.created_by,
    }) satisfies AssignmentApi;

  router.add("GET", "/v1/staff/assignments", async (ctx) => {
    await requireStaff(ctx, "results.view");
    const cohort = await requireCohort(ctx.query.get("cohort_id") ?? undefined);
    return { assignments: (await store.listAssignmentsForCohort(cohort.cohort_id)).map(assignmentView) };
  });

  router.add("POST", "/v1/staff/assignments", async (ctx) => {
    const { staff } = await requireStaff(ctx, "assignment.manage");
    const body = await bodyObject(ctx);
    const moduleId = typeof body.module_id === "string" ? body.module_id : "";
    const mod = moduleId ? await store.getModule(moduleId) : undefined;
    if (!mod) throw new HttpError(404, "NOT_FOUND", "Module not found.");
    if (mod.archived_at) throw new HttpError(409, "MODULE_ARCHIVED", "This module is archived.");
    let version: number | null = null;
    if (body.content_version !== undefined && body.content_version !== null) {
      if (!Number.isInteger(body.content_version) || !content.body(moduleId, body.content_version as number)) throw new HttpError(404, "NOT_FOUND", "That module version is not published.");
      version = body.content_version as number;
    }
    const hasCohort = typeof body.cohort_id === "string";
    const hasLearner = typeof body.learner_id === "string";
    if (hasCohort === hasLearner) throw new HttpError(422, "INVALID_INPUT", "Send exactly one of cohort_id or learner_id.");
    let cohortId: string;
    let learnerId: string | null = null;
    if (hasCohort) cohortId = (await requireCohort(body.cohort_id as string, { active: true })).cohort_id;
    else {
      const learner = await requireLearner(body.learner_id as string);
      if (learner.archived_at) throw new HttpError(409, "LEARNER_ARCHIVED", "This learner is archived.");
      learnerId = learner.learner_id;
      cohortId = learner.cohort_id;
    }
    const existing = await store.listAssignmentsForCohort(cohortId);
    if (existing.some((a) => a.module_id === moduleId && a.content_version === version && (hasCohort ? a.cohort_id === cohortId : a.learner_id === learnerId))) {
      throw new HttpError(409, "ALREADY_ASSIGNED", "This module is already assigned there.");
    }
    const a = { assignment_id: randomUUID(), module_id: moduleId, content_version: version, cohort_id: hasCohort ? cohortId : null, learner_id: learnerId, created_by: staff.staff_id, created_at: ctx.now, removed_at: null };
    await store.createAssignment(a);
    ctx.res.statusCode = 201;
    return { assignment: assignmentView(a) };
  });

  router.add("POST", "/v1/staff/assignments/:id/remove", async (ctx) => {
    await requireStaff(ctx, "assignment.manage");
    const id = ctx.params.id ?? "";
    if (!isUuid(id) || !(await store.removeAssignment(id, ctx.now))) throw new HttpError(404, "NOT_FOUND", "No active assignment with that ID.");
    return { ok: true };
  });

  // ------------------------------------------------------------ reports

  const reportModuleIds = async (cohortId: string, learners: Learner[], only: string | null): Promise<string[]> => {
    if (only) {
      if (!content.library.latest(only)) throw new HttpError(404, "NOT_FOUND", "Module not found.");
      return [only];
    }
    const ids = new Set((await store.listAssignmentsForCohort(cohortId)).map((a) => a.module_id));
    for (const l of learners) for (const e of await store.listEvents(l.learner_id)) if ("module_id" in e) ids.add(e.module_id);
    return [...ids].filter((id) => content.library.latest(id)).sort();
  };

  const learnerRow = async (l: Learner, moduleIds: string[], t: Thresholds) => {
    const [events, rejected] = await Promise.all([store.listEvents(l.learner_id), store.listRejected(l.learner_id)]);
    const report = buildLearnerReport(
      { learner_id: l.learner_id, name: `${l.first_name} ${l.last_name}`, username: l.username ?? "", cohort_id: l.cohort_id },
      events,
      rejected.map((r) => ({ event_id: r.event_id, code: r.code, message: r.message, received_at: r.received_at })),
      content.library,
      { thresholds: t, activeTime: config.activeTime, moduleIds },
    );
    const row = {
      learner: { learner_id: l.learner_id, learner_code: l.learner_code, first_name: l.first_name, last_name: l.last_name, username: l.username, cohort_id: l.cohort_id, archived: !!l.archived_at },
      modules: report.modules.map((m) => ({ ...m, module_name: latestBody(m.module_id)?.title.en ?? m.module_id, status_label: statusLabel(m) })),
      time: report.time,
      // The server can't see a phone's unsent work; never read missing results as "not done".
      sync: { ...report.sync, may_have_unsynced_work: true as const },
    } satisfies LearnerReportRow;
    return { row, events, rejected };
  };

  router.add("GET", "/v1/staff/cohorts/:id/report", async (ctx) => {
    await requireStaff(ctx, "results.view");
    const cohort = await requireCohort(ctx.params.id);
    const learners = await store.listLearners(cohort.cohort_id);
    const t = await env.thresholds();
    const moduleIds = await reportModuleIds(cohort.cohort_id, learners, ctx.query.get("module_id"));
    const rows = await Promise.all(learners.map((l) => learnerRow(l, moduleIds, t)));
    return {
      cohort: cohortView(cohort),
      generated_at: ctx.now,
      thresholds: t,
      active_time: config.activeTime,
      module_ids: moduleIds,
      learners: rows.map((r) => r.row),
    } satisfies CohortReport;
  });

  router.add("GET", "/v1/staff/learners/:id/report", async (ctx) => {
    await requireStaff(ctx, "results.view");
    const learner = await requireLearner(ctx.params.id);
    const t = await env.thresholds();
    const moduleIds = await reportModuleIds(learner.cohort_id, [learner], ctx.query.get("module_id"));
    const { row } = await learnerRow(learner, moduleIds, t);
    return { generated_at: ctx.now, thresholds: t, active_time: config.activeTime, ...row } satisfies LearnerReport;
  });

  router.add("GET", "/v1/staff/cohorts/:id/modules/:moduleId/summary", async (ctx) => {
    await requireStaff(ctx, "results.view");
    const cohort = await requireCohort(ctx.params.id);
    const moduleId = ctx.params.moduleId!;
    if (!content.library.latest(moduleId)) throw new HttpError(404, "NOT_FOUND", "Module not found.");
    const t = await env.thresholds();
    const learners = await store.listLearners(cohort.cohort_id);
    const results: ModuleResult[] = (await Promise.all(learners.map((l) => learnerRow(l, [moduleId], t)))).map((r) => r.row.modules[0]!);
    const started = results.filter((m) => m.completion !== "not_started");
    return {
      cohort_id: cohort.cohort_id,
      module_id: moduleId,
      module_name: latestBody(moduleId)?.title.en ?? moduleId,
      generated_at: ctx.now,
      learner_count: learners.length,
      started_count: started.length,
      completed_count: results.filter((m) => m.completion === "completed").length,
      average_initial_score_percent: avg(results.flatMap((m) => (m.initial ? [m.initial.pct] : []))),
      average_best_score_percent: avg(results.flatMap((m) => (m.best ? [m.best.pct] : []))),
      average_mastery_percent: avg(started.map((m) => m.mastery.pct)),
      passing_count: results.filter((m) => statusLabel(m) === "passing").length,
      struggling_count: results.filter((m) => statusLabel(m) === "struggling").length,
      not_yet_passing_count: results.filter((m) => statusLabel(m) === "not_yet_passing").length,
    } satisfies CohortModuleSummary;
  });

  router.add("GET", "/v1/staff/cohorts/:id/export", async (ctx) => {
    await requireStaff(ctx, "results.export");
    const cohort = await requireCohort(ctx.params.id);
    const learners = await store.listLearners(cohort.cohort_id, { includeArchived: true });
    const t = await env.thresholds();
    const moduleIds = await reportModuleIds(cohort.cohort_id, learners, null);
    const rows = await Promise.all(learners.map((l) => learnerRow(l, moduleIds, t)));
    ctx.res.setHeader("content-disposition", `attachment; filename="tetherless-${cohort.cohort_id}-${ctx.now.slice(0, 10)}.json"`);
    return {
      export_version: 2,
      cohort: cohortView(cohort),
      generated_at: ctx.now,
      thresholds: t,
      active_time: config.activeTime,
      content_versions: moduleIds.map((id) => ({ module_id: id, versions: content.versions(id) })),
      assignments: (await store.listAssignmentsForCohort(cohort.cohort_id)).map(assignmentView),
      note:
        "accepted_events are server-acknowledged. rejected_events were received but not accepted; they are kept for review and never counted. " +
        "local_is_correct, local_correct and local_total are what the phone showed; scores are always recalculated by the server.",
      learners: await Promise.all(
        rows.map(async (r, i) => ({
          ...r.row,
          record: staffLearnerView(learners[i]!, await store.listDevices(learners[i]!.learner_id), { includeDevices: true }),
          accepted_events: r.events,
          rejected_events: r.rejected,
        })),
      ),
    };
  });

  // ------------------------------------------------------------ staff accounts

  const requireAny = async (ctx: Ctx, perms: Permission[]) => {
    const who = await requireStaff(ctx, null);
    if (!perms.some((p) => who.permissions.includes(p))) throw new HttpError(403, "FORBIDDEN", "You don't have access to this.");
    return who;
  };

  router.add("GET", "/v1/staff/accounts", async (ctx) => {
    await requireAny(ctx, ["staff.create_trainer", "staff.create_admin"]);
    return { accounts: (await store.listStaff()).map((s) => staffView(s)) };
  });

  router.add("POST", "/v1/staff/accounts", async (ctx) => {
    const body = await bodyObject(ctx);
    if (!isRole(body.role)) throw new HttpError(422, "INVALID_INPUT", "role must be superadmin, admin or trainer.");
    const { staff } = await requireStaff(ctx, permissionToManage(body.role));
    const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
    const displayName = text(body.display_name, 80);
    const password = typeof body.temporary_password === "string" ? body.temporary_password : "";
    const details: ErrorDetail[] = [];
    if (!STAFF_USERNAME_PATTERN.test(username)) details.push({ field: "username", code: "INVALID", message: "Usernames are 3–32 lowercase letters, numbers, dots, dashes or underscores." });
    if (!displayName) details.push({ field: "display_name", code: "REQUIRED", message: "Enter a display name (up to 80 characters)." });
    if (password.length < MIN_PASSWORD_LENGTH) details.push({ field: "temporary_password", code: "TOO_SHORT", message: `Use at least ${MIN_PASSWORD_LENGTH} characters.` });
    if (details.length) throw new HttpError(422, "VALIDATION_FAILED", "Some fields need fixing.", { details });
    const account: Staff = {
      staff_id: randomUUID(),
      username,
      display_name: displayName!,
      role: body.role,
      password_hash: await hashPassword(password),
      must_change_password: true,
      created_at: ctx.now,
      created_by: staff.staff_id,
      disabled_at: null,
    };
    if (!(await store.createStaff(account))) throw new HttpError(409, "USERNAME_TAKEN", "That username is already taken.");
    ctx.res.statusCode = 201;
    return { account: staffView(account) };
  });

  for (const action of ["disable", "enable"] as const) {
    router.add("POST", `/v1/staff/accounts/:id/${action}`, async (ctx) => {
      const id = ctx.params.id ?? "";
      const target = isUuid(id) ? await store.getStaff(id) : undefined;
      if (!target) throw new HttpError(404, "NOT_FOUND", "Account not found.");
      const { staff } = await requireStaff(ctx, permissionToManage(target.role));
      if (action === "disable") {
        if (target.staff_id === staff.staff_id) throw new HttpError(409, "LOCKOUT_PREVENTED", "You can't disable your own account.");
        if (target.role === "superadmin" && (await store.listStaff()).filter((s) => s.role === "superadmin" && !s.disabled_at).length <= 1) {
          throw new HttpError(409, "LOCKOUT_PREVENTED", "This is the last active Superadmin. Create another Superadmin first.");
        }
        await store.updateStaff(target.staff_id, { disabled_at: target.disabled_at ?? ctx.now });
        await store.deleteStaffSessions(target.staff_id);
      } else {
        await store.updateStaff(target.staff_id, { disabled_at: null });
      }
      return { account: staffView((await store.getStaff(target.staff_id))!) };
    });
  }

  // ------------------------------------------------------------ roles and permissions

  router.add("GET", "/v1/staff/roles", async (ctx) => {
    await requireStaff(ctx, "permissions.manage");
    return { roles: await env.rolePermissions(), permissions: PERMISSIONS };
  });

  router.add("PUT", "/v1/staff/roles/:role/permissions", async (ctx) => {
    const { staff } = await requireStaff(ctx, "permissions.manage");
    const role = ctx.params.role;
    if (!isRole(role)) throw new HttpError(404, "NOT_FOUND", "Roles are superadmin, admin and trainer.");
    const body = await bodyObject(ctx);
    if (!Array.isArray(body.permissions)) throw new HttpError(422, "INVALID_INPUT", "Send { permissions: [...] }.");
    const unknown = body.permissions.filter((p) => !isPermission(p));
    if (unknown.length) throw new HttpError(422, "UNKNOWN_PERMISSION", `Unknown permission(s): ${unknown.map(String).join(", ")}.`);
    if (role === "superadmin" && !body.permissions.includes("permissions.manage")) {
      throw new HttpError(409, "LOCKOUT_PREVENTED", "The Superadmin role must keep permissions.manage.");
    }
    await env.rolePermissions(); // make sure the other roles are seeded first
    await store.setRolePermissions(role, body.permissions as string[]);
    await store.addAudit({ staff_id: staff.staff_id, action: "role.permissions", target: role, detail: body.permissions, at: ctx.now });
    return { role, permissions: (await env.rolePermissions())[role] };
  });

  // ------------------------------------------------------------ settings

  router.add("GET", "/v1/staff/settings/thresholds", async (ctx) => {
    await requireStaff(ctx, "results.view");
    return await env.thresholds();
  });

  router.add("PUT", "/v1/staff/settings/thresholds", async (ctx) => {
    const { staff } = await requireStaff(ctx, "settings.manage");
    const body = await bodyObject(ctx);
    const current = await env.thresholds();
    const next = { ...current };
    const details: ErrorDetail[] = [];
    for (const k of ["pass_pct", "struggling_pct", "weak_topic_pct"] as const) {
      if (body[k] === undefined) continue;
      if (typeof body[k] !== "number" || !Number.isInteger(body[k]) || (body[k] as number) < 0 || (body[k] as number) > 100) details.push({ field: k, code: "INVALID", message: `${k} must be a whole number from 0 to 100.` });
      else next[k] = body[k] as number;
    }
    if (body.weak_topic_min_answers !== undefined) {
      if (!Number.isInteger(body.weak_topic_min_answers) || (body.weak_topic_min_answers as number) < 1) details.push({ field: "weak_topic_min_answers", code: "INVALID", message: "weak_topic_min_answers must be a whole number of 1 or more." });
      else next.weak_topic_min_answers = body.weak_topic_min_answers as number;
    }
    if (!details.length && next.struggling_pct > next.pass_pct) details.push({ field: "struggling_pct", code: "INVALID", message: "The struggling threshold can't be above the passing threshold." });
    if (details.length) throw new HttpError(422, "VALIDATION_FAILED", "Some values need fixing.", { details });
    await store.setSetting("thresholds", next, staff.staff_id, ctx.now);
    await store.addAudit({ staff_id: staff.staff_id, action: "settings.thresholds", target: "thresholds", detail: next, at: ctx.now });
    return next;
  });
}

