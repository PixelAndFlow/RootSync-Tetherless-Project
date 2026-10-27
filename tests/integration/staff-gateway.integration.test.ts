// @vitest-environment node
import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { createApp } from "../../packages/server/src/app.ts";
import { loadConfig } from "../../packages/server/src/config.ts";
import { ContentRegistry } from "../../packages/server/src/content.ts";
import { MemoryStore } from "../../packages/server/src/memory-store.ts";
import { createStaffAccount } from "../../packages/server/src/admin.ts";
import { ApiStaffAdminGateway } from "../../src/services/staff/ApiStaffAdminGateway";

const store = new MemoryStore();
let server: Server;
let base: string;
beforeAll(async () => {
  const config = loadConfig({ AUTH_RATE_LIMIT_PER_MINUTE: "1000" });
  await createStaffAccount(store, { username: "test-admin", displayName: "Test Admin", role: "superadmin", password: "local-test-password" });
  const content = await ContentRegistry.open(store, config.contentDir, new Date().toISOString());
  server = createServer(createApp({ store, content, config }));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => { if (server) await new Promise<void>((resolve) => server.close(() => resolve())); await store.close(); });

it("uses the real in-memory server for cohort, module, student and one-time setup flows", async () => {
  const gateway = new ApiStaffAdminGateway(base);
  await gateway.signIn({ username: "test-admin", password: "local-test-password" });
  expect(await gateway.listCohorts()).toEqual([]);
  expect(await gateway.listLearnerRecords()).toEqual([]);
  expect((await gateway.listModules()).length).toBeGreaterThan(0);
  const login = await fetch(`${base}/v1/staff/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "test-admin", password: "local-test-password" }) }).then((response) => response.json());
  const cohortResponse = await fetch(`${base}/v1/staff/cohorts`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${login.token}` }, body: JSON.stringify({ name: "Synthetic test cohort" }) });
  expect(cohortResponse.status).toBe(201);
  const cohortId = (await cohortResponse.json()).cohort.cohort_id as string;
  const reports = gateway.reports();
  expect(await reports.listLearners({ cohortId })).toEqual([]);
  expect(await gateway.listLearnerRecords({ cohortId })).toEqual([]);
  await expect(gateway.createLearner({ cohortId, firstName: "<invalid>", lastName: "Student" })).rejects.toMatchObject({ code: "VALIDATION_FAILED", status: 422 });
  const reveal = await gateway.createLearner({ cohortId, firstName: "Test", lastName: "Student" });
  const rows = await reports.listLearners({ cohortId });
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ learnerId: reveal.learnerId, mayHaveUnsyncedWork: true });
  expect(await reports.getLearnerReport({ learnerId: reveal.learnerId })).toMatchObject({ learnerId: reveal.learnerId });
  expect((await gateway.listLearnerRecords({ cohortId }))[0]).toMatchObject({ learnerId: reveal.learnerId, status: "awaiting_setup" });
  const setup = async () => fetch(`${base}/v1/setup`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ setup_code: reveal.setupCode, username: "Test Student", device_id: randomUUID() }) });
  expect((await setup()).status).toBe(201);
  const reused = await setup();
  expect((await reused.json()).error.code).toBe("SETUP_CODE_USED");
  expect((await gateway.listLearnerRecords({ cohortId }))[0].status).toBe("active");
});
