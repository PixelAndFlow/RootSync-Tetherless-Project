// Local-dev tool. Assigns a real, already-published module (default:
// phishing-basics v1) to a demo cohort and learner, so the learner flow can
// be proven end to end against a real server without UNKNOWN_MODULE
// rejections — the app's own built-in fixture module is not published
// anywhere (handoff 2026-10-27 item 2a / GitHub issue #7).
//
// Talks to a server you already have running. Defaults to localhost; pass
// TETHERLESS_API_BASE_URL to target another server you control. This never
// defaults to a deployed URL.
//
// Safe to re-run: reuses the cohort/learner/assignment if they already exist.
//
//   DEMO_STAFF_PASSWORD=<the local in-memory server's demo superadmin password> \
//   node scripts/seed-demo-cohort.mjs [moduleId] [contentVersion]
//
// To start a disposable local server that already has this password set:
//   DEMO_STAFF_PASSWORD=<password> node packages/server/src/main.ts

const baseUrl = process.env.TETHERLESS_API_BASE_URL ?? "http://localhost:8080";
const username = process.env.DEMO_STAFF_USERNAME ?? "demo";
const password = process.env.DEMO_STAFF_PASSWORD;
const moduleId = process.argv[2] ?? "phishing-basics";
const contentVersion = Number(process.argv[3] ?? 1);
const COHORT_NAME = "Demo Day Cohort";
const LEARNER = { first_name: "Demo", last_name: "Learner" };

if (!password) {
  console.error("Set DEMO_STAFF_PASSWORD to the target server's demo superadmin password.");
  process.exitCode = 1;
  process.exit();
}

async function api(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${json ? JSON.stringify(json) : ""}`);
  return json;
}

const login = await api("/v1/staff/login", { method: "POST", body: { username, password } });
const token = login.token;
console.log(`Signed in as "${username}" (${login.staff.role}) at ${baseUrl}.`);

const { cohorts } = await api("/v1/staff/cohorts", { token });
let cohort = cohorts.find((c) => c.name === COHORT_NAME);
if (!cohort) {
  ({ cohort } = await api("/v1/staff/cohorts", { method: "POST", token, body: { name: COHORT_NAME } }));
  console.log(`Created cohort "${COHORT_NAME}" (${cohort.cohort_id}).`);
} else {
  console.log(`Reusing cohort "${COHORT_NAME}" (${cohort.cohort_id}).`);
}

const { learners } = await api(`/v1/staff/learners?cohort_id=${cohort.cohort_id}`, { token });
let learner = learners.find((l) => l.first_name === LEARNER.first_name && l.last_name === LEARNER.last_name);
let setupCode;
if (!learner) {
  const created = await api("/v1/staff/learners", { method: "POST", token, body: { cohort_id: cohort.cohort_id, ...LEARNER } });
  learner = created.learner;
  setupCode = created.setup_code;
  console.log(`Created learner "${LEARNER.first_name} ${LEARNER.last_name}" (${learner.learner_id}). Setup code: ${setupCode}`);
} else {
  console.log(`Reusing learner "${LEARNER.first_name} ${LEARNER.last_name}" (${learner.learner_id}). Issue a new setup code with the staff app if you need one.`);
}

const { assignments } = await api(`/v1/staff/assignments?cohort_id=${cohort.cohort_id}`, { token });
const already = assignments.some((a) => a.module_id === moduleId && a.content_version === contentVersion);
if (already) {
  console.log(`${moduleId} v${contentVersion} is already assigned to this cohort.`);
} else {
  await api("/v1/staff/assignments", { method: "POST", token, body: { module_id: moduleId, content_version: contentVersion, cohort_id: cohort.cohort_id } });
  console.log(`Assigned ${moduleId} v${contentVersion} to "${COHORT_NAME}".`);
}

console.log(
  setupCode
    ? `\nDone. Use setup code ${setupCode} in the app to enroll "Demo Learner" and play ${moduleId} for real.`
    : `\nDone. "Demo Learner" is already assigned ${moduleId} — use their existing setup code, or create a new learner to get a fresh one.`,
);
