import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { createApp } from "../src/app.ts";
import { loadConfig } from "../src/config.ts";
import { loadContent } from "../src/content.ts";
import { MemoryStore } from "../src/memory-store.ts";
import { testStore, storeKind } from "./support/test-store.ts";
import { createTrainer } from "../src/admin.ts";
import { hashToken } from "../src/security.ts";
import { scenarioEvents, LEARNERS, DEVICES } from "../../analytics/test/fixtures/scenario.ts";
import { EXPECTED } from "../../analytics/test/fixtures/scenario.expected.ts";

const contentDir = fileURLToPath(new URL("../../../content/modules", import.meta.url));
const config = { ...loadConfig({ CONTENT_DIR: contentDir, CORS_ORIGINS: "https://rco.example.org", AUTH_RATE_LIMIT_PER_MINUTE: "1000" }) };
const store = await testStore();
console.log(`server tests using the ${storeKind} store`);
let now = new Date("2026-10-15T12:00:00.000Z");
let server: Server;
let base = "";

before(async () => {
  await createTrainer(store, "trainer2", "Trainer 2", "correct horse battery staple");
  server = createServer(createApp({ store, content: loadContent(contentDir), config, clock: () => now }));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await store.close();
});

async function call(method: string, path: string, body?: unknown, token?: string, headers: Record<string, string> = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
}

const state: { trainer?: string; cohort?: string; code?: string; tokens: Record<string, string>; learnerIds: Record<string, string> } = { tokens: {}, learnerIds: {} };

test("health and published content", async () => {
  assert.equal((await call("GET", "/healthz")).status, 200);
  const list = await call("GET", "/v1/content/modules");
  assert.deepEqual(list.body.modules.map((m: { module_id: string; content_version: number }) => `${m.module_id}@${m.content_version}`).sort(), ["phishing-basics@1", "pr-bootcamp-security-tools@2"]);
  const m = await call("GET", "/v1/content/modules/pr-bootcamp-security-tools/versions/1");
  assert.equal(m.body.questions.length, 15);
  assert.equal((await call("GET", "/v1/content/modules/nope/versions/1")).status, 404);
});

test("trainer routes deny anonymous access", async () => {
  assert.equal((await call("GET", "/v1/trainer/cohorts")).status, 401);
  assert.equal((await call("GET", "/v1/trainer/cohorts", undefined, "not-a-real-token")).status, 401);
  assert.equal((await call("POST", "/v1/trainer/login", { username: "trainer2", password: "wrong password!!" })).status, 401);
});

test("trainer signs in, creates a cohort with Trainer 2's naming, and gets a code", async () => {
  const login = await call("POST", "/v1/trainer/login", { username: "Trainer2", password: "correct horse battery staple" });
  assert.equal(login.status, 200);
  state.trainer = login.body.token;
  const c = await call("POST", "/v1/trainer/cohorts", { name: "RCYC PR Bootcamp 2026", code: "RCYC-PR-Bootcamp2026" }, state.trainer);
  assert.equal(c.status, 201);
  assert.equal(c.body.enrollment_code.code, "RCYC-PR-BOOTCAMP2026");
  state.cohort = c.body.cohort.cohort_id;
  state.code = c.body.enrollment_code.code;
  assert.equal((await call("POST", "/v1/trainer/cohorts", { name: "Dup", code: "rcyc-pr-bootcamp2026" }, state.trainer)).status, 409);
  const generated = await call("POST", `/v1/trainer/cohorts/${state.cohort}/codes`, {}, state.trainer);
  assert.match(generated.body.enrollment_code.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
});

test("learners enroll with the cohort code (any letter case); token is stored only as a hash", async () => {
  for (const l of LEARNERS) {
    const r = await call("POST", "/v1/enroll", { name: l.name, username: l.username, device_id: DEVICES[l.key], enrollment_code: " rcyc-pr-bootcamp2026 " });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.cohort.name, "RCYC PR Bootcamp 2026");
    assert.match(r.body.device_token, /^[A-Za-z0-9_-]{43}$/); // 32 bytes, Base64URL
    state.tokens[l.key] = r.body.device_token;
    state.learnerIds[l.key] = r.body.learner_id;
    const device = await store.getDeviceByTokenHash(hashToken(r.body.device_token));
    assert.equal(device?.learner_id, r.body.learner_id);
    assert.equal(await store.getDeviceByTokenHash(r.body.device_token), undefined, "plaintext token is not a key");
  }
});

test("enrollment errors are clear and create nothing", async () => {
  const bad = await call("POST", "/v1/enroll", { name: "X", username: "xavier", device_id: "f0000000-0000-4000-8000-000000000001", enrollment_code: "WRONG-CODE" });
  assert.deepEqual([bad.status, bad.body.error.code], [422, "INVALID_CODE"]);
  const taken = await call("POST", "/v1/enroll", { name: "Ana 2", username: "ana.rivera", device_id: "f0000000-0000-4000-8000-000000000002", enrollment_code: state.code });
  assert.deepEqual([taken.status, taken.body.error.code], [409, "USERNAME_TAKEN"]);
  assert.match(taken.body.error.message, /re-link code/);
  const sameDevice = await call("POST", "/v1/enroll", { name: "Z", username: "zed.z", device_id: DEVICES.ana, enrollment_code: state.code });
  assert.equal(sameDevice.body.error.code, "DEVICE_EXISTS");
  assert.equal((await call("POST", "/v1/enroll", { name: "Y", username: "Bad Name!", device_id: "f0000000-0000-4000-8000-000000000003", enrollment_code: state.code })).status, 400);
  assert.equal((await store.listLearners(state.cohort!)).length, 3);
});

test("sync without a valid token stores nothing", async () => {
  const events = scenarioEvents().ana!.slice(0, 2);
  assert.equal((await call("POST", "/v1/sync/events", { schema_version: 1, events })).status, 401);
  assert.equal((await call("POST", "/v1/sync/events", { schema_version: 1, events }, "forged-token")).status, 401);
  assert.equal((await store.listEvents(state.learnerIds.ana!)).length, 0);
});

test("the fixed dataset syncs, with retries and duplicates handled", async () => {
  const all = scenarioEvents();
  for (const l of LEARNERS) {
    const events = all[l.key]!;
    // Interrupted sync: first half, then everything (first half again).
    const half = events.slice(0, Math.floor(events.length / 2));
    const r1 = await call("POST", "/v1/sync/events", { schema_version: 1, events: half }, state.tokens[l.key]);
    assert.equal(r1.status, 200);
    assert.ok(r1.body.results.every((x: { status: string }) => x.status === "accepted"));
    const r2 = await call("POST", "/v1/sync/events", { schema_version: 1, events }, state.tokens[l.key]);
    const statuses = r2.body.results.map((x: { status: string }) => x.status);
    assert.equal(statuses.filter((s: string) => s === "duplicate").length, half.length);
    assert.equal(statuses.filter((s: string) => s === "accepted").length, events.length - half.length);
    assert.equal((await store.listEvents(state.learnerIds[l.key]!)).length, events.length);
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
  const r = await call("POST", "/v1/sync/events", { schema_version: 1, events: batch }, state.tokens.ana);
  assert.deepEqual(
    r.body.results.map((x: { status: string; code?: string }) => x.code ?? x.status),
    ["UNKNOWN_QUESTION", "UNKNOWN_CHOICE", "UNKNOWN_MODULE", "DEVICE_MISMATCH", "EVENT_ID_CONFLICT", "INVALID_EVENT", "accepted"],
  );
  // Resending the same bad batch doesn't pile up duplicate rejections.
  await call("POST", "/v1/sync/events", { schema_version: 1, events: batch.slice(0, 6) }, state.tokens.ana);
  assert.equal((await store.listRejected(state.learnerIds.ana!)).length, 6);
});

test("oversized or malformed batches are refused whole", async () => {
  const many = Array.from({ length: 201 }, () => ({}));
  assert.equal((await call("POST", "/v1/sync/events", { schema_version: 1, events: many }, state.tokens.cara)).status, 413);
  assert.equal((await call("POST", "/v1/sync/events", "{not json", state.tokens.cara)).status, 400);
  assert.equal((await call("POST", "/v1/sync/events", { schema_version: 2, events: [] }, state.tokens.cara)).status, 400);
});

test("trainer report matches the hand-worked dataset", async () => {
  const r = await call("GET", `/v1/trainer/cohorts/${state.cohort}/report`, undefined, state.trainer);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.thresholds.pass_pct, 70);
  assert.deepEqual(r.body.thresholds.struggling_pct, 60);
  for (const l of LEARNERS) {
    const row = r.body.learners.find((x: { learner: { username: string } }) => x.learner.username === l.username);
    const m = row.modules.find((x: { module_id: string }) => x.module_id === "pr-bootcamp-security-tools");
    const exp = EXPECTED[l.key];
    // Ana's extra timeout answer (event 6 above) repeats q01 inside attempt 1, so only her first answer counts.
    assert.deepEqual(m.initial, exp.initial, l.key);
    assert.deepEqual(m.best, exp.best, l.key);
    assert.deepEqual(m.mastery, exp.mastery, l.key);
    assert.deepEqual(m.struggling_reasons, exp.struggling_reasons, l.key);
    assert.equal(row.time.active_ms, exp.active_ms, l.key);
    assert.equal(row.sync.seq_gaps.length, l.key === "ana" ? 1 : exp.seq_gaps, l.key); // Ana's test event jumped to seq 1006
  }
  const ana = r.body.learners.find((x: { learner: { username: string } }) => x.learner.username === "ana.rivera");
  assert.equal(ana.sync.rejected_events, 6);
});

test("JSON export agrees with the report and includes rejected events with reasons", async () => {
  const report = await call("GET", `/v1/trainer/cohorts/${state.cohort}/report`, undefined, state.trainer);
  const exp = await call("GET", `/v1/trainer/cohorts/${state.cohort}/export`, undefined, state.trainer);
  assert.match(exp.headers.get("content-disposition") ?? "", /attachment/);
  for (const row of exp.body.learners) {
    const match = report.body.learners.find((x: { learner: { learner_id: string } }) => x.learner.learner_id === row.learner.learner_id);
    assert.deepEqual(row.modules, match.modules);
    assert.equal(row.accepted_events.length, row.sync.accepted_events);
  }
  const ana = exp.body.learners.find((x: { learner: { username: string } }) => x.learner.username === "ana.rivera");
  assert.deepEqual(ana.rejected_events.map((x: { code: string }) => x.code).sort(), ["DEVICE_MISMATCH", "EVENT_ID_CONFLICT", "INVALID_EVENT", "UNKNOWN_CHOICE", "UNKNOWN_MODULE", "UNKNOWN_QUESTION"]);
  assert.ok(ana.rejected_events.every((x: { raw: unknown; message: string }) => x.raw && x.message));
});

test("a replaced phone: re-link code moves the learner, history stays together", async () => {
  const relink = await call("POST", `/v1/trainer/learners/${state.learnerIds.ben}/relink`, {}, state.trainer);
  assert.equal(relink.status, 201);
  const newDevice = "b0000000-0000-4000-8000-0000000000b2";
  const wrongUser = await call("POST", "/v1/enroll", { name: "Ben", username: "not.ben", device_id: newDevice, relink_code: relink.body.relink_code });
  assert.equal(wrongUser.body.error.code, "INVALID_CODE");
  const ok = await call("POST", "/v1/enroll", { name: "Ben Ortiz", username: "ben.ortiz", device_id: newDevice, relink_code: relink.body.relink_code.toLowerCase() });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.learner_id, state.learnerIds.ben);
  const again = await call("POST", "/v1/enroll", { name: "Ben Ortiz", username: "ben.ortiz", device_id: "b0000000-0000-4000-8000-0000000000b3", relink_code: relink.body.relink_code });
  assert.equal(again.body.error.code, "INVALID_CODE", "re-link codes work once");
  assert.equal((await store.listDevices(state.learnerIds.ben!)).length, 2);
});

test("revoked devices and codes stop working; expired trainer sessions too", async () => {
  assert.equal((await call("POST", `/v1/trainer/devices/${DEVICES.cara}/revoke`, {}, state.trainer)).status, 200);
  assert.equal((await call("POST", "/v1/sync/events", { schema_version: 1, events: [] }, state.tokens.cara)).status, 401);
  assert.equal((await call("POST", `/v1/trainer/codes/${encodeURIComponent("rcyc-pr-bootcamp2026")}/revoke`, {}, state.trainer)).status, 200);
  const late = await call("POST", "/v1/enroll", { name: "Late", username: "late.comer", device_id: "f0000000-0000-4000-8000-00000000000f", enrollment_code: state.code });
  assert.equal(late.body.error.code, "INVALID_CODE");
  now = new Date(now.getTime() + 13 * 3600_000);
  assert.equal((await call("GET", "/v1/trainer/cohorts", undefined, state.trainer)).status, 401);
});

test("CORS allows only the configured app address", async () => {
  const ok = await call("OPTIONS", "/v1/sync/events", undefined, undefined, { origin: "https://rco.example.org" });
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get("access-control-allow-origin"), "https://rco.example.org");
  const other = await call("OPTIONS", "/v1/sync/events", undefined, undefined, { origin: "https://evil.example" });
  assert.equal(other.headers.get("access-control-allow-origin"), null);
});

test("enrollment and login are rate limited", async () => {
  const strict = createServer(createApp({ store: new MemoryStore(), content: loadContent(contentDir), config: { ...config, authRateLimitPerMinute: 2 } }));
  await new Promise<void>((r) => strict.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(strict.address() as AddressInfo).port}/v1/trainer/login`;
  const statuses = [];
  for (let i = 0; i < 3; i++) statuses.push((await fetch(url, { method: "POST", body: "{}" })).status);
  await new Promise<void>((r) => strict.close(() => r()));
  assert.deepEqual(statuses, [401, 401, 429]);
});
