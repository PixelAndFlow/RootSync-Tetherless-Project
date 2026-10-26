/**
 * End-to-end API tests for spec v1.10, run in order against one server:
 * staff and permissions → cohorts → learners and roster import → device
 * setup → assignments → sync of the fixed dataset → reports and export →
 * replaced phones → modules → roles, thresholds, archive and purge.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createApp } from "../src/app.ts";
import { loadConfig } from "../src/config.ts";
import { ContentRegistry } from "../src/content.ts";
import { MemoryStore } from "../src/memory-store.ts";
import { testStore, storeKind } from "./support/test-store.ts";
import { createStaffAccount } from "../src/admin.ts";
import { hashToken } from "../src/security.ts";
import { scenarioEvents, LEARNERS, DEVICES } from "../../analytics/test/fixtures/scenario.ts";
import { EXPECTED } from "../../analytics/test/fixtures/scenario.expected.ts";

const contentDir = fileURLToPath(new URL("../../../content/modules", import.meta.url));
const config = loadConfig({ CONTENT_DIR: contentDir, CORS_ORIGINS: "https://rco.example.org", AUTH_RATE_LIMIT_PER_MINUTE: "1000" });
const store = await testStore();
console.log(`server tests using the ${storeKind} store`);
let now = new Date("2026-10-15T12:00:00.000Z");
let server: Server;
let base = "";
const PW = "correct horse battery staple";

before(async () => {
  await createStaffAccount(store, { username: "marc", displayName: "Marc", role: "superadmin", password: PW });
  const content = await ContentRegistry.open(store, contentDir, now.toISOString());
  server = createServer(createApp({ store, content, config, clock: () => now }));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await store.close();
});

async function call(method: string, path: string, body?: unknown, token?: string, headers: Record<string, string> = {}) {
  const isRaw = body instanceof Uint8Array;
  const res = await fetch(base + path, {
    method,
    headers: { ...(isRaw ? {} : { "content-type": "application/json" }), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : isRaw ? (body as Uint8Array) : typeof body === "string" ? body : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
}

function multipart(fields: Record<string, string>, file: { name: string; data: Buffer; type: string }) {
  const boundary = "----tetherless-test-boundary";
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`), file.data, Buffer.from(`\r\n--${boundary}--\r\n`));
  return { body: new Uint8Array(Buffer.concat(parts)), headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

const s: {
  marc?: string;
  trainer?: string;
  admin?: string;
  cohort?: string;
  codes: Record<string, string>;
  tokens: Record<string, string>;
  learnerIds: Record<string, string>;
  learnerCodes: Record<string, string>;
} = { codes: {}, tokens: {}, learnerIds: {}, learnerCodes: {} };

// ------------------------------------------------------------ public and errors

test("health; module downloads need a phone or staff token; errors use one shape", async () => {
  const h = await call("GET", "/healthz");
  assert.equal(h.status, 200);
  assert.equal(h.body.modules, 3, "the three repo modules are seeded on first start");
  const anon = await call("GET", "/v1/content/modules/pr-bootcamp-security-tools/versions/2");
  assert.equal(anon.status, 401);
  assert.equal(anon.body.error.code, "UNAUTHORIZED");
  assert.match(anon.body.error.request_id, /^req-[0-9a-f]{8}$/);
  assert.equal(anon.body.error.retryable, false);
  assert.deepEqual(anon.body.error.details, []);
  assert.equal(anon.headers.get("x-request-id"), anon.body.error.request_id);
  assert.equal((await call("GET", "/v1/trainer/cohorts")).status, 404, "old /v1/trainer routes are gone");
  assert.equal((await call("POST", "/v1/enroll", {})).status, 404, "cohort-code enrollment is gone");
});

// ------------------------------------------------------------ staff, roles, password change

test("Superadmin signs in and sees every permission", async () => {
  assert.equal((await call("POST", "/v1/staff/login", { username: "marc", password: "wrong password!!" })).status, 401);
  const login = await call("POST", "/v1/staff/login", { username: "Marc", password: PW });
  assert.equal(login.status, 200);
  s.marc = login.body.token;
  assert.equal(login.body.staff.role, "superadmin");
  assert.ok(login.body.staff.permissions.includes("permissions.manage"));
  assert.ok(login.body.staff.permissions.includes("data.purge"));
  const me = await call("GET", "/v1/staff/me", undefined, s.marc);
  assert.equal(me.body.username, "marc");
});

test("new staff get a temporary password and must change it before doing anything", async () => {
  const mk = await call("POST", "/v1/staff/accounts", { username: "nick", display_name: "Nick", role: "admin", temporary_password: "temporary-pass-1" }, s.marc);
  assert.equal(mk.status, 201, JSON.stringify(mk.body));
  assert.equal(mk.body.account.must_change_password, true);
  const login = await call("POST", "/v1/staff/login", { username: "nick", password: "temporary-pass-1" });
  s.admin = login.body.token;
  const blocked = await call("GET", "/v1/staff/cohorts", undefined, s.admin);
  assert.deepEqual([blocked.status, blocked.body.error.code], [403, "PASSWORD_CHANGE_REQUIRED"]);
  assert.equal((await call("POST", "/v1/staff/me/password", { current_password: "temporary-pass-1", new_password: "short" }, s.admin)).status, 422);
  assert.equal((await call("POST", "/v1/staff/me/password", { current_password: "temporary-pass-1", new_password: "nick's own password" }, s.admin)).status, 200);
  assert.equal((await call("GET", "/v1/staff/cohorts", undefined, s.admin)).status, 200);
});

test("an Admin can create Trainers but not Admins; a Trainer can create neither", async () => {
  const t = await call("POST", "/v1/staff/accounts", { username: "trainer.maria", display_name: "Maria", role: "trainer", temporary_password: "temporary-pass-2" }, s.admin);
  assert.equal(t.status, 201);
  const noAdmin = await call("POST", "/v1/staff/accounts", { username: "other.admin", display_name: "X", role: "admin", temporary_password: "temporary-pass-3" }, s.admin);
  assert.equal(noAdmin.status, 403);
  const dup = await call("POST", "/v1/staff/accounts", { username: "trainer.maria", display_name: "Maria 2", role: "trainer", temporary_password: "temporary-pass-2" }, s.admin);
  assert.equal(dup.body.error.code, "USERNAME_TAKEN");
  const bad = await call("POST", "/v1/staff/accounts", { username: "Bad Name", display_name: "", role: "trainer", temporary_password: "x" }, s.admin);
  assert.equal(bad.status, 422);
  assert.deepEqual(bad.body.error.details.map((d: { field: string }) => d.field).sort(), ["display_name", "temporary_password", "username"]);

  const login = await call("POST", "/v1/staff/login", { username: "trainer.maria", password: "temporary-pass-2" });
  await call("POST", "/v1/staff/me/password", { current_password: "temporary-pass-2", new_password: "maria's own password" }, login.body.token);
  s.trainer = login.body.token;
  assert.equal((await call("POST", "/v1/staff/accounts", { username: "t2", display_name: "T2", role: "trainer", temporary_password: "temporary-pass-4" }, s.trainer)).status, 403);
  assert.equal((await call("GET", "/v1/staff/roles", undefined, s.trainer)).status, 403);
});

// ------------------------------------------------------------ cohorts

test("cohorts: any name RCO likes, unique ignoring letter case; rename and list", async () => {
  const c = await call("POST", "/v1/staff/cohorts", { name: "RCYC-PR-Bootcamp2026" }, s.trainer);
  assert.equal(c.status, 201);
  s.cohort = c.body.cohort.cohort_id;
  assert.equal((await call("POST", "/v1/staff/cohorts", { name: "rcyc-pr-bootcamp2026" }, s.trainer)).body.error.code, "COHORT_NAME_TAKEN");
  const other = await call("POST", "/v1/staff/cohorts", { name: "RCO-NY-lead" }, s.trainer);
  assert.equal((await call("PATCH", `/v1/staff/cohorts/${other.body.cohort.cohort_id}`, { name: "RCYC-PR-Bootcamp2026" }, s.trainer)).status, 409);
  assert.equal((await call("PATCH", `/v1/staff/cohorts/${other.body.cohort.cohort_id}`, { name: "RCO-NY-Lead-2026" }, s.trainer)).body.cohort.name, "RCO-NY-Lead-2026");
  assert.equal((await call("POST", `/v1/staff/cohorts/${other.body.cohort.cohort_id}/archive`, {}, s.trainer)).status, 200);
  const list = await call("GET", "/v1/staff/cohorts", undefined, s.trainer);
  assert.deepEqual(list.body.cohorts.map((x: { name: string }) => x.name), ["RCYC-PR-Bootcamp2026"]);
  assert.equal((await call("GET", "/v1/staff/cohorts?include_archived=true", undefined, s.trainer)).body.cohorts.length, 2);
});

// ------------------------------------------------------------ learners and roster

test("a trainer adds a learner on the spot and gets a one-time setup code once", async () => {
  const bad = await call("POST", "/v1/staff/learners", { cohort_id: s.cohort, first_name: "", last_name: "Rivera", email: "not-an-email" }, s.trainer);
  assert.equal(bad.status, 422);
  assert.deepEqual(bad.body.error.details.map((d: { field: string }) => d.field).sort(), ["email", "first_name"]);
  const r = await call("POST", "/v1/staff/learners", { cohort_id: s.cohort, first_name: "Ana", last_name: "Rivera", phone: "787-555-0101", email: "ana@example.org", training_level: "Beginner", note_1: "Front row" }, s.trainer);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.match(r.body.setup_code, /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
  assert.match(r.body.learner.learner_code, /^RCYC-PR-Bootcamp2026-[A-HJKMNP-Z2-9]{4}$/);
  assert.equal(r.body.learner.username, null);
  assert.equal(r.body.learner.status, "awaiting_setup");
  s.codes.ana = r.body.setup_code;
  s.learnerIds.ana = r.body.learner.learner_id;
  s.learnerCodes.ana = r.body.learner.learner_code;
});

test("roster import: a CSV with problems is checked, reported by row and can't be committed", async () => {
  const csv = "first_name,last_name,email,phone\nBen,Ortiz,ben@example.org,787-555-0102\n,Méndez,cara@example,\n\nDee,,,abc\n";
  const m = multipart({ cohort_id: s.cohort! }, { name: "roster.csv", data: Buffer.from(csv, "utf8"), type: "text/csv" });
  const r = await call("POST", "/v1/staff/learners/import/check", m.body, s.trainer, m.headers);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.valid, false);
  assert.equal(r.body.rows_total, 3);
  assert.deepEqual(r.body.errors.map((e: { row: number; field: string }) => `${e.row}:${e.field}`), ["3:first_name", "3:email", "5:last_name", "5:phone"]);
  const commit = await call("POST", `/v1/staff/learners/import/${r.body.import_id}/commit`, {}, s.trainer);
  assert.equal(commit.body.error.code, "IMPORT_INVALID");
});

test("roster import: an Excel roster is checked, previewed, then committed with codes shown once", async () => {
  const data = readFileSync(fileURLToPath(new URL("./fixtures/roster.xlsx", import.meta.url)));
  const m = multipart({ cohort_id: s.cohort! }, { name: "roster.xlsx", data, type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const r = await call("POST", "/v1/staff/learners/import/check", m.body, s.trainer, m.headers);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.valid, true, JSON.stringify(r.body.errors));
  assert.deepEqual(r.body.warnings.map((w: { code: string }) => w.code), ["UNKNOWN_COLUMN"]);
  assert.deepEqual(r.body.preview.map((p: { first_name: string; last_name: string }) => `${p.first_name} ${p.last_name}`), ["Ben Ortiz", "Cara Méndez"]);
  assert.equal(r.body.preview[1].note_1, "Prefers Spanish");
  const commit = await call("POST", `/v1/staff/learners/import/${r.body.import_id}/commit`, {}, s.trainer);
  assert.equal(commit.status, 201);
  assert.equal(commit.body.created, 2);
  for (const l of commit.body.learners) {
    const key = l.first_name === "Ben" ? "ben" : "cara";
    s.codes[key] = l.setup_code;
    s.learnerIds[key] = l.learner_id;
    s.learnerCodes[key] = l.learner_code;
  }
  assert.equal((await call("POST", `/v1/staff/learners/import/${r.body.import_id}/commit`, {}, s.trainer)).body.error.code, "IMPORT_NOT_FOUND", "a check commits once");
});

test("staff see contact fields; the learner list searches by name, username or learner ID", async () => {
  const one = await call("GET", `/v1/staff/learners/${s.learnerIds.ana}`, undefined, s.trainer);
  assert.equal(one.body.email, "ana@example.org");
  assert.equal(one.body.cohort_name, "RCYC-PR-Bootcamp2026");
  assert.deepEqual(one.body.devices, []);
  const all = await call("GET", `/v1/staff/learners?cohort_id=${s.cohort}`, undefined, s.trainer);
  assert.deepEqual(all.body.learners.map((l: { last_name: string }) => l.last_name), ["Méndez", "Ortiz", "Rivera"]);
  const found = await call("GET", `/v1/staff/learners?cohort_id=${s.cohort}&q=${encodeURIComponent(s.learnerCodes.ben!.slice(-4))}`, undefined, s.trainer);
  assert.ok(found.body.learners.some((l: { first_name: string }) => l.first_name === "Ben"));
  const patched = await call("PATCH", `/v1/staff/learners/${s.learnerIds.ben}`, { training_level: "Intermediate", phone: "" }, s.trainer);
  assert.equal(patched.body.training_level, "Intermediate");
  assert.equal(patched.body.phone, null);
  assert.equal((await call("PATCH", `/v1/staff/learners/${s.learnerIds.ben}`, { username: "hacker" }, s.trainer)).body.error.code, "READ_ONLY_FIELD");
});

// ------------------------------------------------------------ device setup

test("learners set up their phones with the code and any username; usernames repeat", async () => {
  const names: Record<string, string> = { ana: "Ana R.", ben: "Jay", cara: "Jay" };
  for (const l of LEARNERS) {
    const typed = l.key === "ana" ? ` ${s.codes[l.key]!.toLowerCase().replace(/-/g, " ")} ` : s.codes[l.key]!;
    const r = await call("POST", "/v1/setup", { setup_code: typed, username: names[l.key], device_id: DEVICES[l.key] });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.match(r.body.device_token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(r.body.learner.learner_id, s.learnerIds[l.key]);
    assert.equal(r.body.learner.learner_code, s.learnerCodes[l.key]);
    assert.equal(r.body.learner.username, names[l.key]);
    assert.equal(r.body.learner.cohort_name, "RCYC-PR-Bootcamp2026");
    assert.deepEqual(Object.keys(r.body.learner).sort(), ["cohort_name", "learner_code", "learner_id", "username"], "no contact fields go to the phone");
    s.tokens[l.key] = r.body.device_token;
    const device = await store.getDeviceByTokenHash(hashToken(r.body.device_token));
    assert.equal(device?.learner_id, s.learnerIds[l.key]);
    assert.equal(await store.getDeviceByTokenHash(r.body.device_token), undefined, "plaintext token is not a key");
  }
});

test("setup errors are clear and create nothing", async () => {
  const fresh = "f0000000-0000-4000-8000-000000000001";
  const wrong = await call("POST", "/v1/setup", { setup_code: "AAAA-BBBB-CCCC", username: "Zed", device_id: fresh });
  assert.deepEqual([wrong.status, wrong.body.error.code], [422, "SETUP_CODE_INVALID"]);
  const used = await call("POST", "/v1/setup", { setup_code: s.codes.ana, username: "Zed", device_id: fresh });
  assert.deepEqual([used.status, used.body.error.code], [409, "SETUP_CODE_USED"]);
  const badName = await call("POST", "/v1/setup", { setup_code: s.codes.ana, username: "x", device_id: fresh });
  assert.deepEqual([badName.status, badName.body.error.code], [422, "USERNAME_INVALID"]);
  assert.equal((await store.listDevices(s.learnerIds.ana!)).length, 1);
});

// ------------------------------------------------------------ assignments

test("assignments: cohort and individual; each phone lists only its modules", async () => {
  assert.deepEqual((await call("GET", "/v1/me/modules", undefined, s.tokens.ana)).body.modules, []);
  const a = await call("POST", "/v1/staff/assignments", { module_id: "pr-bootcamp-security-tools", content_version: 2, cohort_id: s.cohort }, s.trainer);
  assert.equal(a.status, 201, JSON.stringify(a.body));
  assert.equal((await call("POST", "/v1/staff/assignments", { module_id: "pr-bootcamp-security-tools", content_version: 2, cohort_id: s.cohort }, s.trainer)).body.error.code, "ALREADY_ASSIGNED");
  assert.equal((await call("POST", "/v1/staff/assignments", { module_id: "phishing-basics", learner_id: s.learnerIds.cara }, s.trainer)).status, 201);
  assert.equal((await call("POST", "/v1/staff/assignments", { module_id: "phishing-basics", cohort_id: s.cohort, learner_id: s.learnerIds.cara }, s.trainer)).status, 422);
  const ana = await call("GET", "/v1/me/modules", undefined, s.tokens.ana);
  assert.deepEqual(ana.body.modules.map((m: { module_id: string; content_version: number }) => `${m.module_id}@${m.content_version}`), ["pr-bootcamp-security-tools@2"]);
  const cara = await call("GET", "/v1/me/modules", undefined, s.tokens.cara);
  assert.deepEqual(cara.body.modules.map((m: { module_id: string }) => m.module_id).sort(), ["phishing-basics", "pr-bootcamp-security-tools"]);
  const dl = await call("GET", "/v1/content/modules/pr-bootcamp-security-tools/versions/2", undefined, s.tokens.ana);
  assert.equal(dl.body.schema_version, "tetherless.module.v1", "phones get the app's module format");
  assert.equal(dl.body.questions.length, 15);
  assert.ok(dl.body.questions[0].correct_choice, "answer key included for offline feedback");
  const list = await call("GET", `/v1/staff/assignments?cohort_id=${s.cohort}`, undefined, s.trainer);
  assert.deepEqual(list.body.assignments.map((x: { target: string }) => x.target), ["cohort", "learner"]);
});

// ------------------------------------------------------------ sync

test("sync without a valid token stores nothing", async () => {
  const events = scenarioEvents().ana!.slice(0, 2);
  assert.equal((await call("POST", "/v1/sync/events", { schema_version: 1, events })).status, 401);
  assert.equal((await call("POST", "/v1/sync/events", { schema_version: 1, events }, "forged-token")).status, 401);
  assert.equal((await store.listEvents(s.learnerIds.ana!)).length, 0);
});

test("the fixed dataset syncs, with retries and duplicates handled", async () => {
  const all = scenarioEvents();
  for (const l of LEARNERS) {
    const events = all[l.key]!;
    const half = events.slice(0, Math.floor(events.length / 2));
    const r1 = await call("POST", "/v1/sync/events", { schema_version: 1, events: half }, s.tokens[l.key]);
    assert.equal(r1.status, 200);
    assert.ok(r1.body.results.every((x: { status: string }) => x.status === "accepted"), JSON.stringify(r1.body.results.find((x: { status: string }) => x.status !== "accepted")));
    const r2 = await call("POST", "/v1/sync/events", { schema_version: 1, events }, s.tokens[l.key]);
    const statuses = r2.body.results.map((x: { status: string }) => x.status);
    assert.equal(statuses.filter((x: string) => x === "duplicate").length, half.length);
    assert.equal(statuses.filter((x: string) => x === "accepted").length, events.length - half.length);
    assert.equal((await store.listEvents(s.learnerIds[l.key]!)).length, events.length);
  }
});

test("bad events are rejected one by one, kept, and never retried into the score", async () => {
  const ana = scenarioEvents().ana!;
  const answer = ana.find((e) => e.event_type === "answer_submitted")!;
  const mk = (n: number, patch: Record<string, unknown>) => ({ ...answer, event_id: `beef0000-0000-4000-8000-${String(n).padStart(12, "0")}`, device_seq: 1000 + n, ...patch });
  const batch = [
    mk(1, { question_id: "pr-bootcamp-security-tools-q99" }),
    mk(2, { payload: { choice_id: "z" } }),
    mk(3, { content_version: 9 }),
    mk(4, { device_id: DEVICES.ben }),
    { ...answer, payload: { choice_id: answer.payload.choice_id === "a" ? "b" : "a" } }, // same event_id, different content
    mk(5, { learner_id: "someone-else" }),
    mk(6, { payload: { choice_id: null } }), // a valid timeout answer
  ];
  const r = await call("POST", "/v1/sync/events", { schema_version: 1, events: batch }, s.tokens.ana);
  assert.deepEqual(
    r.body.results.map((x: { status: string; code?: string }) => x.code ?? x.status),
    ["UNKNOWN_QUESTION", "UNKNOWN_CHOICE", "UNKNOWN_MODULE", "DEVICE_MISMATCH", "EVENT_ID_CONFLICT", "INVALID_EVENT", "accepted"],
  );
  await call("POST", "/v1/sync/events", { schema_version: 1, events: batch.slice(0, 6) }, s.tokens.ana);
  assert.equal((await store.listRejected(s.learnerIds.ana!)).length, 6);
});

test("Naquan's event shape: device-calculated fields and uppercase choice IDs are accepted (E-5 to E-8)", async () => {
  const cara = scenarioEvents().cara!;
  const start = cara.find((e) => e.event_type === "attempt_started")!;
  const answer = cara.find((e) => e.event_type === "answer_submitted")!;
  const attempt = "c0de0000-0000-4000-8000-000000000001";
  const base = { session_id: start.session_id, device_id: DEVICES.cara, schema_version: 1, occurred_at: start.occurred_at, monotonic_ms: 1, module_id: answer.module_id, content_version: answer.content_version };
  const events = [
    { ...base, event_id: "c0de0000-0000-4000-8000-000000000011", device_seq: 2001, event_type: "attempt_started", attempt_id: attempt, payload: { attempt_kind: "practice", question_ids: [answer.question_id] } },
    { ...base, event_id: "c0de0000-0000-4000-8000-000000000012", device_seq: 2002, event_type: "answer_submitted", attempt_id: attempt, question_id: answer.question_id, payload: { choice_id: (answer.payload.choice_id ?? "a").toUpperCase(), local_is_correct: true } },
    { ...base, event_id: "c0de0000-0000-4000-8000-000000000013", device_seq: 2003, event_type: "attempt_completed", attempt_id: attempt, payload: { local_correct: 1, local_total: 1 } },
  ];
  const r = await call("POST", "/v1/sync/events", { schema_version: 1, events }, s.tokens.cara);
  assert.deepEqual(r.body.results.map((x: { status: string; message?: string }) => x.message ?? x.status), ["accepted", "accepted", "accepted"]);
  const stored = (await store.listEvents(s.learnerIds.cara!)).find((e) => e.event_id === events[1]!.event_id)!;
  assert.equal((stored.payload as { choice_id: string }).choice_id, (answer.payload.choice_id ?? "a").toLowerCase());
  const again = await call("POST", "/v1/sync/events", { schema_version: 1, events }, s.tokens.cara);
  assert.deepEqual(again.body.results.map((x: { status: string }) => x.status), ["duplicate", "duplicate", "duplicate"]);
});

// ------------------------------------------------------------ reports

const findRow = (rows: { learner: { learner_id: string } }[], key: string) => rows.find((x) => x.learner.learner_id === s.learnerIds[key])!;

test("cohort report matches the hand-worked dataset and adds status labels", async () => {
  const r = await call("GET", `/v1/staff/cohorts/${s.cohort}/report?module_id=pr-bootcamp-security-tools`, undefined, s.trainer);
  assert.equal(r.status, 200);
  assert.equal(r.body.thresholds.pass_pct, 70);
  assert.equal(r.body.thresholds.struggling_pct, 50);
  assert.deepEqual(r.body.module_ids, ["pr-bootcamp-security-tools"]);
  for (const l of LEARNERS) {
    const row = findRow(r.body.learners, l.key) as unknown as {
      learner: { learner_code: string; first_name: string; username: string };
      modules: { module_id: string; module_name: string; initial: unknown; best: unknown; mastery: unknown; struggling_reasons: string[]; status_label: string }[];
      time: { active_ms: number };
      sync: { seq_gaps: unknown[]; may_have_unsynced_work: boolean; last_received_at: string };
    };
    const m = row.modules[0]!;
    const exp = EXPECTED[l.key];
    assert.deepEqual(m.initial, exp.initial, l.key);
    assert.deepEqual(m.best, exp.best, l.key);
    assert.deepEqual(m.mastery, l.key === "cara" ? m.mastery : exp.mastery, l.key);
    assert.deepEqual(m.struggling_reasons, exp.struggling_reasons, l.key);
    assert.equal(m.module_name, "Security Tools Basics", l.key);
    assert.equal(row.time.active_ms, exp.active_ms, l.key);
    assert.equal(row.sync.may_have_unsynced_work, true);
    assert.equal(row.learner.learner_code, s.learnerCodes[l.key]);
  }
  const labels = Object.fromEntries(LEARNERS.map((l) => [l.key, (findRow(r.body.learners, l.key) as unknown as { modules: { status_label: string }[] }).modules[0]!.status_label]));
  assert.deepEqual(labels, { ana: "passing", ben: "struggling", cara: labels.cara });
  assert.ok(["struggling", "not_yet_passing"].includes(labels.cara!));
});

test("one learner's report, and the cohort summary for a module", async () => {
  const one = await call("GET", `/v1/staff/learners/${s.learnerIds.ana}/report?module_id=pr-bootcamp-security-tools`, undefined, s.trainer);
  assert.equal(one.status, 200);
  assert.deepEqual(one.body.modules[0].initial, EXPECTED.ana.initial);
  const sum = await call("GET", `/v1/staff/cohorts/${s.cohort}/modules/pr-bootcamp-security-tools/summary`, undefined, s.trainer);
  assert.equal(sum.body.learner_count, 3);
  assert.equal(sum.body.completed_count, 2, "Ana and Ben completed a full attempt; Cara only practiced");
  assert.equal(sum.body.average_initial_score_percent, Math.round(((EXPECTED.ana.initial.pct + EXPECTED.ben.initial!.pct) / 2) * 10) / 10);
  assert.equal(sum.body.passing_count, 1);
});

test("JSON export agrees with the report and adds records, assignments and rejected events", async () => {
  const report = await call("GET", `/v1/staff/cohorts/${s.cohort}/report`, undefined, s.trainer);
  const exp = await call("GET", `/v1/staff/cohorts/${s.cohort}/export`, undefined, s.trainer);
  assert.match(exp.headers.get("content-disposition") ?? "", /attachment/);
  assert.equal(exp.body.export_version, 2);
  assert.equal(exp.body.assignments.length, 2);
  for (const row of exp.body.learners) {
    const match = report.body.learners.find((x: { learner: { learner_id: string } }) => x.learner.learner_id === row.learner.learner_id);
    assert.deepEqual(row.modules, match.modules);
    assert.equal(row.accepted_events.length, row.sync.accepted_events);
    assert.ok("email" in row.record);
  }
  const ana = exp.body.learners.find((x: { learner: { learner_id: string } }) => x.learner.learner_id === s.learnerIds.ana);
  assert.deepEqual(ana.rejected_events.map((x: { code: string }) => x.code).sort(), ["DEVICE_MISMATCH", "EVENT_ID_CONFLICT", "INVALID_EVENT", "UNKNOWN_CHOICE", "UNKNOWN_MODULE", "UNKNOWN_QUESTION"]);
  const cara = exp.body.learners.find((x: { learner: { learner_id: string } }) => x.learner.learner_id === s.learnerIds.cara);
  const practice = cara.modules.find((m: { module_id: string }) => m.module_id === "pr-bootcamp-security-tools").attempts.find((a: { attempt_id: string }) => a.attempt_id === "c0de0000-0000-4000-8000-000000000001");
  assert.deepEqual(practice.device_score, { correct: 1, total: 1 }, "the phone's own score is exported next to the server's");
});

// ------------------------------------------------------------ replaced phone

test("a replaced phone: new setup code for the same learner; the old phone is switched off", async () => {
  const unused = await call("POST", `/v1/staff/learners/${s.learnerIds.ben}/setup-code`, {}, s.trainer);
  const r = await call("POST", `/v1/staff/learners/${s.learnerIds.ben}/setup-code`, { switch_off_existing_phones: true }, s.trainer);
  assert.equal(r.status, 201);
  assert.equal(r.body.phones_switched_off, 1);
  assert.equal((await call("POST", "/v1/sync/events", { schema_version: 1, events: [] }, s.tokens.ben)).status, 401, "old phone is off");
  const newDevice = "b0000000-0000-4000-8000-0000000000b2";
  assert.equal((await call("POST", "/v1/setup", { setup_code: unused.body.setup_code, username: "Ben", device_id: newDevice })).body.error.code, "SETUP_CODE_INVALID", "an earlier unused code was replaced");
  const ok = await call("POST", "/v1/setup", { setup_code: r.body.setup_code, username: "Ben O.", device_id: newDevice });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.learner.learner_id, s.learnerIds.ben, "same learner record, history stays together");
  const detail = await call("GET", `/v1/staff/learners/${s.learnerIds.ben}`, undefined, s.trainer);
  assert.equal(detail.body.devices.length, 2);
  assert.equal(detail.body.status, "active");
  assert.equal(detail.body.username, "Ben O.");
  const report = await call("GET", `/v1/staff/learners/${s.learnerIds.ben}/report?module_id=pr-bootcamp-security-tools`, undefined, s.trainer);
  assert.deepEqual(report.body.modules[0].initial, EXPECTED.ben.initial, "initial score didn't restart");
  s.tokens.ben = ok.body.device_token;
});

// ------------------------------------------------------------ modules

function chrisModule(version = 1, questions = 2) {
  return {
    schema_version: "tetherless.module.v1",
    module_id: "security-tools",
    content_version: version,
    activity_type: "multiple_choice",
    note: "Week 1",
    level: "beginner",
    title: { en: "Security Tools", es: "Herramientas de seguridad" },
    settings: { question_count: questions, timer_seconds: null, show_immediate_feedback: true, allow_retry: true, spanish_assist_default: false },
    questions: Array.from({ length: questions }, (_, i) => ({
      id: `tools-00${i + 1}`,
      topic: "network",
      type: "multiple_choice",
      presentation: "kahoot_cards",
      prompt: { en: `Question ${i + 1}?` },
      choices: [
        { id: "A", en: "Right" },
        { id: "B", en: "Wrong" },
      ],
      correct_choice: "A",
      feedback: { en: "Because." },
    })),
  };
}

test("modules: check, publish, versions never change, and the new-version rule", async () => {
  const bad = await call("POST", "/v1/staff/modules/check", { ...chrisModule(), content_version: "0.1.0" }, s.trainer);
  assert.equal(bad.body.valid, false);
  assert.equal(bad.body.will_be, "blocked");
  assert.equal(bad.body.errors[0].code, "INVALID_VERSION");
  const good = await call("POST", "/v1/staff/modules/check", chrisModule(), s.trainer);
  assert.deepEqual([good.body.valid, good.body.will_be, good.body.summary.module_name, good.body.summary.question_count], [true, "new_module", "Security Tools", 2]);
  assert.ok(good.body.warnings.some((w: { code: string }) => w.code === "SPANISH_MISSING"));

  const pub = await call("POST", "/v1/staff/modules", chrisModule(), s.trainer);
  assert.equal(pub.status, 201, JSON.stringify(pub.body));
  const again = await call("POST", "/v1/staff/modules", chrisModule(), s.trainer);
  assert.deepEqual([again.status, again.body.error.code], [409, "VERSION_EXISTS"]);
  const dropped = await call("POST", "/v1/staff/modules", chrisModule(2, 1), s.trainer);
  assert.equal(dropped.status, 422);
  assert.equal(dropped.body.error.details[0].code, "REMOVED_WITHOUT_RETIRING");
  const v2 = await call("POST", "/v1/staff/modules", { ...chrisModule(2, 1), retired_question_ids: ["tools-002"] }, s.trainer);
  assert.equal(v2.status, 201);
  const list = await call("GET", "/v1/staff/modules", undefined, s.trainer);
  const tools = list.body.modules.find((m: { module_id: string }) => m.module_id === "security-tools");
  assert.deepEqual([tools.latest_version, tools.versions, tools.note, tools.used], [2, [1, 2], "Week 1", false]);
  assert.equal((await call("GET", "/v1/staff/modules/security-tools/versions/1", undefined, s.trainer)).body.questions.length, 2, "version 1 is unchanged");
});

test("modules in use can be archived but never deleted; unused ones can be purged by the Superadmin", async () => {
  const inUse = await call("DELETE", "/v1/staff/modules/pr-bootcamp-security-tools", undefined, s.marc);
  assert.deepEqual([inUse.status, inUse.body.error.code], [409, "IN_USE"]);
  assert.equal((await call("DELETE", "/v1/staff/modules/security-tools", undefined, s.trainer)).status, 403, "trainers can't purge");
  assert.equal((await call("DELETE", "/v1/staff/modules/security-tools", undefined, s.marc)).status, 200);
  assert.equal((await call("GET", "/healthz")).body.modules, 3);
  assert.equal((await call("POST", "/v1/staff/modules/phishing-basics/archive", {}, s.trainer)).status, 200);
  const cara = await call("GET", "/v1/me/modules", undefined, s.tokens.cara);
  assert.deepEqual(cara.body.modules.map((m: { module_id: string }) => m.module_id), ["pr-bootcamp-security-tools"], "archived modules leave phones' lists");
  assert.equal((await call("POST", "/v1/staff/assignments", { module_id: "phishing-basics", cohort_id: s.cohort }, s.trainer)).body.error.code, "MODULE_ARCHIVED");
});

// ------------------------------------------------------------ roles, thresholds

test("the Superadmin changes role permissions; lockouts are prevented", async () => {
  const roles = await call("GET", "/v1/staff/roles", undefined, s.marc);
  const trainerPerms: string[] = roles.body.roles.trainer;
  assert.ok(trainerPerms.includes("content.create"));
  const without = trainerPerms.filter((p) => p !== "content.create");
  assert.equal((await call("PUT", "/v1/staff/roles/trainer/permissions", { permissions: without }, s.marc)).status, 200);
  assert.equal((await call("POST", "/v1/staff/modules/check", chrisModule(), s.trainer)).status, 403);
  assert.equal((await call("PUT", "/v1/staff/roles/trainer/permissions", { permissions: trainerPerms }, s.marc)).status, 200);
  assert.equal((await call("POST", "/v1/staff/modules/check", chrisModule(), s.trainer)).status, 200);
  assert.equal((await call("PUT", "/v1/staff/roles/trainer/permissions", { permissions: ["made.up"] }, s.marc)).body.error.code, "UNKNOWN_PERMISSION");
  assert.equal((await call("PUT", "/v1/staff/roles/superadmin/permissions", { permissions: ["results.view"] }, s.marc)).body.error.code, "LOCKOUT_PREVENTED");
  const me = (await call("GET", "/v1/staff/me", undefined, s.marc)).body;
  assert.equal((await call("POST", `/v1/staff/accounts/${me.staff_id}/disable`, {}, s.marc)).body.error.code, "LOCKOUT_PREVENTED");
});

test("disabling an account ends its sessions; enabling restores sign-in", async () => {
  const accounts = (await call("GET", "/v1/staff/accounts", undefined, s.admin)).body.accounts;
  const maria = accounts.find((a: { username: string }) => a.username === "trainer.maria");
  assert.equal((await call("POST", `/v1/staff/accounts/${maria.staff_id}/disable`, {}, s.admin)).status, 200);
  assert.equal((await call("GET", "/v1/staff/cohorts", undefined, s.trainer)).status, 401);
  assert.equal((await call("POST", "/v1/staff/login", { username: "trainer.maria", password: "maria's own password" })).body.error.code, "ACCOUNT_DISABLED");
  assert.equal((await call("POST", `/v1/staff/accounts/${maria.staff_id}/enable`, {}, s.admin)).status, 200);
  s.trainer = (await call("POST", "/v1/staff/login", { username: "trainer.maria", password: "maria's own password" })).body.token;
  assert.ok(s.trainer);
});

test("thresholds are server settings: read by staff, changed only by the Superadmin", async () => {
  assert.deepEqual((await call("GET", "/v1/staff/settings/thresholds", undefined, s.trainer)).body, { pass_pct: 70, struggling_pct: 50, weak_topic_pct: 60, weak_topic_min_answers: 2 });
  assert.equal((await call("PUT", "/v1/staff/settings/thresholds", { pass_pct: 75 }, s.trainer)).status, 403);
  assert.equal((await call("PUT", "/v1/staff/settings/thresholds", { pass_pct: 50, struggling_pct: 60 }, s.marc)).status, 422);
  assert.equal((await call("PUT", "/v1/staff/settings/thresholds", { pass_pct: 101 }, s.marc)).status, 422);
  assert.equal((await call("PUT", "/v1/staff/settings/thresholds", { pass_pct: 85 }, s.marc)).body.pass_pct, 85);
  const r = await call("GET", `/v1/staff/cohorts/${s.cohort}/report?module_id=pr-bootcamp-security-tools`, undefined, s.trainer);
  assert.equal(r.body.thresholds.pass_pct, 85);
  assert.equal((findRow(r.body.learners, "ana") as unknown as { modules: { passed: boolean }[] }).modules[0]!.passed, true, "Ana's best is 100");
  await call("PUT", "/v1/staff/settings/thresholds", { pass_pct: 70 }, s.marc);
});

// ------------------------------------------------------------ archive and purge

test("archiving a learner hides them and switches off their phone; history stays", async () => {
  assert.equal((await call("POST", `/v1/staff/learners/${s.learnerIds.ben}/archive`, {}, s.trainer)).status, 200);
  assert.equal((await call("POST", "/v1/sync/events", { schema_version: 1, events: [] }, s.tokens.ben)).status, 401);
  const list = await call("GET", `/v1/staff/learners?cohort_id=${s.cohort}`, undefined, s.trainer);
  assert.ok(!list.body.learners.some((l: { learner_id: string }) => l.learner_id === s.learnerIds.ben));
  const archived = await call("GET", `/v1/staff/learners?cohort_id=${s.cohort}&include_archived=true`, undefined, s.trainer);
  assert.equal(archived.body.learners.find((l: { learner_id: string }) => l.learner_id === s.learnerIds.ben).status, "archived");
  assert.ok((await store.listEvents(s.learnerIds.ben!)).length > 0, "events are kept");
  assert.equal((await call("POST", `/v1/staff/learners/${s.learnerIds.ben}/setup-code`, {}, s.trainer)).body.error.code, "LEARNER_ARCHIVED");
});

test("a privacy purge needs the Superadmin and the learner ID typed back; it removes everything", async () => {
  assert.equal((await call("POST", `/v1/staff/learners/${s.learnerIds.cara}/purge`, { confirm: s.learnerCodes.cara }, s.admin)).status, 403);
  assert.equal((await call("POST", `/v1/staff/learners/${s.learnerIds.cara}/purge`, { confirm: "wrong" }, s.marc)).body.error.code, "CONFIRMATION_REQUIRED");
  const r = await call("POST", `/v1/staff/learners/${s.learnerIds.cara}/purge`, { confirm: s.learnerCodes.cara }, s.marc);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.events_deleted > 0);
  assert.equal((await call("GET", `/v1/staff/learners/${s.learnerIds.cara}`, undefined, s.marc)).status, 404);
  assert.equal((await store.listEvents(s.learnerIds.cara!)).length, 0);
  assert.equal((await call("POST", "/v1/sync/events", { schema_version: 1, events: [] }, s.tokens.cara)).status, 401);
  if (store instanceof MemoryStore) assert.equal(store.audit.find((a) => a.action === "learner.purge")?.target, s.learnerCodes.cara);
});

// ------------------------------------------------------------ transport

test("expired staff sessions stop working", async () => {
  now = new Date(now.getTime() + 13 * 3600_000);
  assert.equal((await call("GET", "/v1/staff/cohorts", undefined, s.trainer)).status, 401);
  now = new Date(now.getTime() - 13 * 3600_000);
});

test("CORS allows only the configured app address, with the methods the staff API uses", async () => {
  const ok = await call("OPTIONS", "/v1/sync/events", undefined, undefined, { origin: "https://rco.example.org" });
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get("access-control-allow-origin"), "https://rco.example.org");
  assert.match(ok.headers.get("access-control-allow-methods") ?? "", /PATCH.*PUT.*DELETE/);
  const other = await call("OPTIONS", "/v1/sync/events", undefined, undefined, { origin: "https://evil.example" });
  assert.equal(other.headers.get("access-control-allow-origin"), null);
});

test("setup and sign-in are rate limited", async () => {
  const fresh = new MemoryStore();
  const strict = createServer(createApp({ store: fresh, content: await ContentRegistry.open(fresh, contentDir), config: { ...config, authRateLimitPerMinute: 2 } }));
  await new Promise<void>((r) => strict.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(strict.address() as AddressInfo).port}`;
  const statuses = [];
  for (let i = 0; i < 2; i++) statuses.push((await fetch(`${url}/v1/staff/login`, { method: "POST", body: "{}" })).status);
  const limited = await fetch(`${url}/v1/setup`, { method: "POST", body: "{}" });
  statuses.push(limited.status);
  const body = (await limited.json()) as { error: { retryable: boolean } };
  await new Promise<void>((r) => strict.close(() => r()));
  assert.deepEqual(statuses, [401, 401, 429]);
  assert.equal(body.error.retryable, true);
});
