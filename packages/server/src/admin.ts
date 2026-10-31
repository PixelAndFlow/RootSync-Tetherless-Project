/**
 * Administration from the server's command line. Use it once, to create the
 * first Superadmin; after that, staff accounts are made in the app
 * (POST /v1/staff/accounts), and nobody can sign themselves up. An account
 * locked out of its own password (forgotten, never recorded, or simply lost)
 * has no self-service recovery -- reset-password is the only way back in.
 *
 *   echo 'a-long-password' | node src/admin.ts create-staff --role superadmin --username marc --name "Marc"
 *   node src/admin.ts reset-password --username marc
 *   node src/admin.ts list-cohorts
 *
 * Uses DATABASE_URL like the server.
 *
 * Handoff (spec v1.10 §4): RootSync holds the Superadmin account until
 * handoff. Nick then creates his own Superadmin and disables RootSync's.
 */

import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { STAFF_USERNAME_PATTERN } from "../../contract/src/index.ts";
import { isRole, type Role } from "./permissions.ts";
import { hashPassword } from "./security.ts";
import { MIN_PASSWORD_LENGTH } from "./staff-routes.ts";
import type { Store } from "./store.ts";

export { MIN_PASSWORD_LENGTH };

export async function createStaffAccount(
  store: Store,
  input: { username: string; displayName: string; role: Role; password: string; mustChangePassword?: boolean; createdBy?: string | null },
): Promise<string> {
  const username = input.username.toLowerCase();
  if (!STAFF_USERNAME_PATTERN.test(username)) throw new Error("Username must be 3–32 lowercase letters, numbers, dots, dashes or underscores.");
  if (input.password.length < MIN_PASSWORD_LENGTH) throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  const staff_id = randomUUID();
  const ok = await store.createStaff({
    staff_id,
    username,
    display_name: input.displayName,
    role: input.role,
    password_hash: await hashPassword(input.password),
    must_change_password: input.mustChangePassword ?? false,
    created_at: new Date().toISOString(),
    created_by: input.createdBy ?? null,
    disabled_at: null,
  });
  if (!ok) throw new Error(`Username ${username} is already taken.`);
  return staff_id;
}

function generatePassword(): string {
  return randomUUID().replace(/-/g, "").slice(0, 16);
}

/** Resets an existing account to a freshly generated one-time password, the
 * same "must change on next sign-in" state a brand-new account starts in.
 * There is no other way to recover an account whose password is unknown --
 * self-service change requires the current password, which this bypasses. */
export async function resetStaffPassword(store: Store, username: string): Promise<{ password: string }> {
  const staff = await store.getStaffByUsername(username.toLowerCase());
  if (!staff) throw new Error(`No staff account named ${username}.`);
  const password = generatePassword();
  const ok = await store.updateStaff(staff.staff_id, { password_hash: await hashPassword(password), must_change_password: true });
  if (!ok) throw new Error(`Could not reset ${username}'s password.`);
  return { password };
}

/** Demo only (in-memory store): Superadmin "demo" with the given password. */
export async function seedDemoStaff(store: Store, password: string): Promise<void> {
  await createStaffAccount(store, { username: "demo", displayName: "Demo Superadmin", role: "superadmin", password });
  console.log('Demo Superadmin "demo" created (in-memory store).');
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
}

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { username: { type: "string" }, name: { type: "string" }, role: { type: "string" } } });
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL to the server's database.");
  const { PgStore } = await import("./pg-store.ts");
  const store = await PgStore.connect(url);
  try {
    switch (positionals[0]) {
      case "create-staff": {
        const role = values.role ?? "superadmin";
        if (!values.username || !values.name || !isRole(role)) throw new Error("Give --role superadmin|admin|trainer, --username and --name; pipe the password on stdin.");
        await createStaffAccount(store, { username: values.username, displayName: values.name, role, password: await readStdin() });
        console.log(`${role} ${values.username} created.`);
        break;
      }
      case "reset-password": {
        if (!values.username) throw new Error("Give --username.");
        const { password } = await resetStaffPassword(store, values.username);
        console.log(`${values.username}'s password has been reset. One-time temporary password (shown once, not stored anywhere): ${password}`);
        console.log("The account must change it on next sign-in.");
        break;
      }
      case "list-cohorts":
        for (const c of await store.listCohorts(true)) console.log(`${c.cohort_id}  ${c.name}  (${c.learners} learners)${c.archived_at ? "  [archived]" : ""}`);
        break;
      default:
        console.log("Commands: create-staff --role <superadmin|admin|trainer> --username <u> --name <n>  (password on stdin) | reset-password --username <u> | list-cohorts");
    }
  } finally {
    await store.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error((e as Error).message);
    process.exit(1);
  });
}
