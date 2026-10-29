/**
 * Records the real response of each staff route named in
 * packages/contract/src/staff-api.ts (Cohort, LearnerRecord, ModuleListing,
 * Assignment, StaffAccount, the report rows, and the error shape) to
 * packages/contract/fixtures/*.json, from a small fixed dataset built in
 * this file.
 *
 * These are genuinely live responses from a running server (MemoryStore,
 * fixed clock) — not hand-written samples. Re-running this test regenerates
 * every fixture; staff_id/cohort_id/learner_id/etc. are server-issued UUIDs,
 * so they change on every run and that's expected. What should NOT change
 * on a clean run is the *shape*: the set of keys and their types. If it
 * does, either this test's assertions below will fail first, or the diff
 * on the committed fixture will show it — that's the point of recording
 * these at all (Tetherless_Contract_Drift_and_Naming_Proposal_v1.00 §2.3).
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createApp } from "../src/app.ts";
import { loadConfig } from "../src/config.ts";
import { ContentRegistry } from "../src/content.ts";
import { MemoryStore } from "../src/memory-store.ts";
import { createStaffAccount } from "../src/admin.ts";

const contentDir = fileURLToPath(new URL("../../../content/modules", import.meta.url));
const fixturesDir = fileURLToPath(new URL("../../contract/fixtures", import.meta.url));
const config = loadConfig({ CONTENT_DIR: contentDir, CORS_ORIGINS: "https://rco.example.org", AUTH_RATE_LIMIT_PER_MINUTE: "1000" });
const store = new MemoryStore();
const now = new Date("2026-10-25T09:00:00.000Z");
const PW = "correct horse battery staple";

let server: Server;
let base = "";

before(async () => {
  await createStaffAccount(store, { username: "marc", displayName: "Marc Delsoin", role: "superadmin", password: PW });
  const content = await ContentRegistry.open(store, contentDir, now.toISOString());
  server = createServer(createApp({ store, content, config, clock: () => now }));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  mkdirSync(fixturesDir, { recursive: true });
});
after(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await store.close();
});

async function call(method: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

function record(name: string, value: unknown): void {
  writeFileSync(`${fixturesDir}/${name}.json`, `${JSON.stringify(value, null, 2)}\n`);
}

function securityToolsModule() {
  return {
    schema_version: "tetherless.module.v1",
    module_id: "security-tools",
    content_version: 1,
    activity_type: "multiple_choice",
    note: "Week 1",
    level: "beginner",
    title: { en: "Security Tools", es: "Herramientas de seguridad" },
    settings: { question_count: 2, timer_seconds: null, show_immediate_feedback: true, allow_retry: true, spanish_assist_default: false },
    questions: [1, 2].map((i) => ({
      id: `tools-00${i}`,
      topic: "network",
      type: "multiple_choice",
      presentation: "kahoot_cards",
      prompt: { en: `Question ${i}?` },
      choices: [
        { id: "A", en: "Right" },
        { id: "B", en: "Wrong" },
      ],
      correct_choice: "A",
      feedback: { en: "Because." },
    })),
  };
}

test("records every staff contract fixture from one fixed dataset", async () => {
  const marc = (await call("POST", "/v1/staff/login", { username: "marc", password: PW })).body.token as string;

  // ---- staff accounts: a Trainer, then the list with both accounts
  const trainerCreate = await call(
    "POST",
    "/v1/staff/accounts",
    { username: "trainer1", display_name: "Test Trainer", role: "trainer", temporary_password: PW },
    marc,
  );
  assert.equal(trainerCreate.status, 201);
  const accounts = await call("GET", "/v1/staff/accounts", undefined, marc);
  assert.equal(accounts.status, 200);
  record("staff-accounts", accounts.body);

  const trainer = (await call("POST", "/v1/staff/login", { username: "trainer1", password: PW })).body.token as string;
  // A temp-password account can't do anything else until it changes its password.
  assert.equal((await call("POST", "/v1/staff/me/password", { current_password: PW, new_password: "trainer initial password" }, trainer)).status, 200);

  // ---- cohort
  const cohortCreate = await call("POST", "/v1/staff/cohorts", { name: "Fixture Cohort" }, marc);
  assert.equal(cohortCreate.status, 201);
  const cohortId = cohortCreate.body.cohort.cohort_id as string;

  // ---- four learners, one per LearnerStatus value
  async function newLearner(firstName: string) {
    const r = await call("POST", "/v1/staff/learners", { cohort_id: cohortId, first_name: firstName, last_name: "Fixture" }, trainer);
    assert.equal(r.status, 201);
    return { learnerId: r.body.learner.learner_id as string, setupCode: r.body.setup_code as string };
  }
  const awaiting = await newLearner("Awaiting");
  const active = await newLearner("Active");
  const switchedOff = await newLearner("SwitchedOff");
  const archived = await newLearner("Archived");

  for (const [learner, username] of [
    [active, "Active Learner"],
    [switchedOff, "Switched Off Learner"],
  ] as const) {
    const setup = await call("POST", "/v1/setup", { setup_code: learner.setupCode, username, device_id: crypto.randomUUID() });
    assert.equal(setup.status, 201);
  }
  const switchedOffDetail = await call("GET", `/v1/staff/learners/${switchedOff.learnerId}`, undefined, trainer);
  const deviceId = switchedOffDetail.body.devices[0].device_id as string;
  assert.equal((await call("POST", `/v1/staff/learners/${switchedOff.learnerId}/devices/${deviceId}/switch-off`, {}, trainer)).status, 200);
  assert.equal((await call("POST", `/v1/staff/learners/${archived.learnerId}/archive`, {}, trainer)).status, 200);

  const learners = await call("GET", `/v1/staff/learners?cohort_id=${cohortId}&include_archived=true`, undefined, trainer);
  assert.equal(learners.status, 200);
  assert.deepEqual(
    learners.body.learners.map((l: { status: string }) => l.status).sort(),
    ["active", "archived", "awaiting_setup", "phone_switched_off"],
    "the fixture should show all four LearnerStatus values",
  );
  record("learners", learners.body);

  // ---- module
  const publish = await call("POST", "/v1/staff/modules", securityToolsModule(), trainer);
  assert.equal(publish.status, 201);
  const modules = await call("GET", "/v1/staff/modules", undefined, trainer);
  assert.equal(modules.status, 200);
  record("modules", modules.body);

  // ---- cohort list now that a learner exists, and assignment
  const cohorts = await call("GET", "/v1/staff/cohorts", undefined, trainer);
  assert.equal(cohorts.status, 200);
  record("cohorts", cohorts.body);

  const assignmentCreate = await call("POST", "/v1/staff/assignments", { module_id: "security-tools", cohort_id: cohortId }, trainer);
  assert.equal(assignmentCreate.status, 201);
  const assignments = await call("GET", `/v1/staff/assignments?cohort_id=${cohortId}`, undefined, trainer);
  assert.equal(assignments.status, 200);
  record("assignments", assignments.body);

  // ---- reports (no synced events yet — exercises the not_started/null-score shape)
  const cohortReport = await call("GET", `/v1/staff/cohorts/${cohortId}/report`, undefined, trainer);
  assert.equal(cohortReport.status, 200);
  record("cohort-report", cohortReport.body);

  const learnerReport = await call("GET", `/v1/staff/learners/${active.learnerId}/report`, undefined, trainer);
  assert.equal(learnerReport.status, 200);
  record("learner-report", learnerReport.body);

  // ---- error shape: a validation failure with field-level details
  const invalid = await call("POST", "/v1/staff/learners", { cohort_id: cohortId, last_name: "No First Name" }, trainer);
  assert.equal(invalid.status, 422);
  record("error-validation", invalid.body);
});
