import { test } from "node:test";
import assert from "node:assert/strict";
import { createStaffAccount, resetStaffPassword } from "../src/admin.ts";
import { MemoryStore } from "../src/memory-store.ts";
import { verifyPassword } from "../src/security.ts";

test("resetStaffPassword replaces an account's password with a fresh one-time password and requires it be changed", async () => {
  const store = new MemoryStore();
  await createStaffAccount(store, { username: "marc-test-trainer", displayName: "Marc Test", role: "trainer", password: "a-long-forgotten-password" });

  const { password } = await resetStaffPassword(store, "marc-test-trainer");

  const staff = await store.getStaffByUsername("marc-test-trainer");
  assert.ok(staff);
  assert.equal(await verifyPassword("a-long-forgotten-password", staff!.password_hash), false, "the old password must no longer work");
  assert.equal(await verifyPassword(password, staff!.password_hash), true, "the new one-time password must work");
  assert.equal(staff!.must_change_password, true);
});

test("resetStaffPassword is case-insensitive about the username, like account creation", async () => {
  const store = new MemoryStore();
  await createStaffAccount(store, { username: "marc-test-trainer", displayName: "Marc Test", role: "trainer", password: "a-long-forgotten-password" });
  await assert.doesNotReject(() => resetStaffPassword(store, "MARC-TEST-TRAINER"));
});

test("resetStaffPassword rejects an unknown username with a clear error, not a generic failure", async () => {
  const store = new MemoryStore();
  await assert.rejects(() => resetStaffPassword(store, "nobody-here"), /No staff account named nobody-here/);
});
