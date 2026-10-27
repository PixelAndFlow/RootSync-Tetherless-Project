/**
 * Read-only check of a running Tetherless server against the app's own gateways.
 *
 * Signs in as a staff member, then makes every staff and trainer report read the app
 * makes and runs each response through the app's validators and mappers. Nothing is
 * created, changed or deleted. Output is counts and PASS/FAIL only: no names, ids,
 * tokens or passwords. On a validation failure it prints the response's shape (keys and
 * value types, never values) so the mismatch can be fixed without seeing the data.
 *
 *   VITE_TETHERLESS_API_BASE_URL=https://your-server npx vite-node scripts/live-check.ts
 *
 * The password is typed at a hidden prompt. For automation set TT_USER and TT_PW.
 * Set TT_SHAPES=1 to print the shape of every response, not only failures.
 */

import { ApiError } from "../src/services/api/ApiError";
import { ApiStaffAdminGateway } from "../src/services/staff/ApiStaffAdminGateway";

const baseUrl = (process.env.VITE_TETHERLESS_API_BASE_URL ?? "").replace(/\/+$/, "");
const showAllShapes = process.env.TT_SHAPES === "1";

function die(message: string): never {
  console.error(message);
  process.exit(2);
}

function ask(question: string, hidden: boolean): Promise<string> {
  return new Promise((resolve) => {
    const { stdin, stdout } = process;
    if (!stdin.isTTY) {
      let buf = "";
      stdin.setEncoding("utf8");
      stdin.on("data", (d) => (buf += d));
      stdin.on("end", () => resolve(buf.split("\n")[0] ?? ""));
      return;
    }
    stdout.write(question);
    let value = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n" || ch === "\u0004") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          stdout.write("\n");
          return resolve(value);
        }
        if (ch === "\u0003") { stdout.write("\n"); process.exit(130); }
        if (ch === "\u007f" || ch === "\b") { value = value.slice(0, -1); continue; }
        value += ch;
        if (!hidden) stdout.write(ch);
      }
    };
    stdin.on("data", onData);
  });
}

/** Keys and value types only. Arrays show their first element's shape and a length. */
function shape(value: unknown, depth = 0): unknown {
  if (value === null) return "null";
  if (Array.isArray(value)) return depth > 4 ? "array" : [`${value.length} item(s)`, ...(value.length ? [shape(value[0], depth + 1)] : [])];
  if (typeof value === "object") {
    if (depth > 4) return "object";
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, shape(v, depth + 1)]));
  }
  return typeof value;
}

// Remember the last response body so a failure can show its shape.
let lastPath = "";
let lastBody: unknown;
const recording: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  lastPath = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url).pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, ":id");
  lastBody = await response.clone().json().catch(() => "(not JSON)");
  if (showAllShapes) console.log(`   shape of ${lastPath}: ${JSON.stringify(shape(lastBody))}`);
  return response;
};

let failures = 0;
async function step<T>(label: string, run: () => Promise<T>, summarise: (value: T) => string): Promise<T | undefined> {
  try {
    const value = await run();
    console.log(`PASS  ${label}: ${summarise(value)}`);
    return value;
  } catch (error) {
    failures += 1;
    const code = error instanceof ApiError ? `${error.code}${error.status ? ` (HTTP ${error.status})` : ""}` : error instanceof Error ? error.name : "error";
    console.log(`FAIL  ${label}: ${code}`);
    if (error instanceof ApiError && error.code === "INVALID_RESPONSE") {
      console.log(`      the server answered ${lastPath} with this shape:`);
      console.log(`      ${JSON.stringify(shape(lastBody))}`);
    }
    return undefined;
  }
}

async function main() {
  if (!baseUrl) die("Set VITE_TETHERLESS_API_BASE_URL to the server address, for example https://your-server.example");
  console.log(`Server: ${new URL(baseUrl).host}   (read-only: nothing is created or changed)`);

  const username = process.env.TT_USER ?? (await ask("Staff username: ", false));
  const password = process.env.TT_PW ?? (await ask("Password (hidden): ", true));
  if (!username || !password) die("A username and password are needed.");

  const staff = new ApiStaffAdminGateway(baseUrl, recording);
  const session = await step("sign in", () => staff.signIn({ username: username.trim(), password }), (s) => `role ${s.role}${s.passwordChangeRequired ? ", password change required" : ""}`);
  if (!session) return;
  if (session.passwordChangeRequired) die("This account must change its password in the app before the reads can be checked.");

  const cohorts = await step("cohorts", () => staff.listCohorts(), (c) => `${c.length} cohort(s)`);
  const modules = await step("modules", () => staff.listModules(), (m) => `${m.length} module(s)`);
  const learners = await step("learner records (all cohorts)", () => staff.listLearnerRecords(), (l) => `${l.length} learner(s)`);

  const trainer = staff.trainerData();
  const cohortIds = (cohorts ?? []).map((c) => c.cohortId);
  const staffLearnerIds = new Set((learners ?? []).map((l) => l.learnerId));
  const reportLearnerIds = new Set<string>();
  const detailTargets: Array<{ learnerId: string; moduleId: string }> = [];
  const summaryTargets: Array<{ cohortId: string; moduleId: string }> = [];

  for (const [i, cohortId] of cohortIds.entries()) {
    const rows = await step(`trainer report, cohort ${i + 1} of ${cohortIds.length}`, () => trainer.listLearners({ cohortId }), (r) => {
      const placeholders = r.filter((x) => x.noModuleResults).length;
      return `${r.length} row(s), ${new Set(r.map((x) => x.learnerId)).size} learner(s), ${placeholders} with no module results`;
    });
    for (const row of rows ?? []) {
      reportLearnerIds.add(row.learnerId);
      if (!row.noModuleResults) {
        if (!detailTargets.some((t) => t.learnerId === row.learnerId && t.moduleId === row.moduleId)) detailTargets.push({ learnerId: row.learnerId, moduleId: row.moduleId });
        if (!summaryTargets.some((t) => t.cohortId === cohortId && t.moduleId === row.moduleId)) summaryTargets.push({ cohortId, moduleId: row.moduleId });
      }
    }
  }

  // At most 3 of each, enough to show the shapes without a long run.
  for (const [i, t] of detailTargets.slice(0, 3).entries()) {
    await step(`learner module detail ${i + 1} of ${Math.min(3, detailTargets.length)}`, () => trainer.getLearnerModuleDetail(t.learnerId, t.moduleId), (d) => `${d.attempts.length} attempt(s)`);
  }
  for (const [i, t] of summaryTargets.slice(0, 3).entries()) {
    await step(`module cohort summary ${i + 1} of ${Math.min(3, summaryTargets.length)}`, () => trainer.getModuleCohortSummary(t), () => "ok");
  }
  if (detailTargets.length === 0) console.log("NOTE  no learner has module results yet, so the detail and summary reads were not exercised");

  // Cross-checks between the two views of the same people.
  if (learners && cohorts && cohortIds.length > 0) {
    const missing = [...reportLearnerIds].filter((id) => !staffLearnerIds.has(id)).length;
    if (missing > 0) { failures += 1; console.log(`FAIL  consistency: ${missing} learner(s) in the trainer report are not in the staff learner list`); }
    else console.log(`PASS  consistency: every learner in the trainer report is in the staff learner list (${reportLearnerIds.size} of ${staffLearnerIds.size})`);
  }

  await fetch(`${baseUrl}/v1/staff/logout`, { method: "POST", headers: { authorization: `Bearer ${(staff as unknown as { token: string | null }).token ?? ""}` } }).catch(() => undefined);
  staff.signOut();

  console.log(failures === 0 ? "\nRESULT: all checks passed." : `\nRESULT: ${failures} check(s) failed. Paste this output back.`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error(`Unexpected failure: ${error instanceof Error ? error.name : "error"}`);
  process.exit(1);
});
