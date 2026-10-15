/**
 * Administration from the server's command line. There is no trainer
 * self-signup; whoever runs the server creates trainer accounts.
 *
 *   echo 'a-long-password' | node src/admin.ts create-trainer --username trainer2 --name "Trainer 2"
 *   node src/admin.ts list-cohorts
 *
 * Uses DATABASE_URL like the server.
 */

import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { hashPassword } from "./security.ts";
import type { Store } from "./store.ts";

export const MIN_PASSWORD_LENGTH = 12;

export async function createTrainer(store: Store, username: string, name: string, password: string): Promise<void> {
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) throw new Error("Username must be 3–32 lowercase letters, numbers, dots, dashes or underscores.");
  if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  await store.createTrainer({ trainer_id: randomUUID(), username, name, password_hash: await hashPassword(password) });
}

/** Demo only (in-memory store): trainer "demo" with the given password. */
export async function seedDemoTrainer(store: Store, password: string): Promise<void> {
  await createTrainer(store, "demo", "Demo Trainer", password);
  console.log('Demo trainer "demo" created (in-memory store).');
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
}

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { username: { type: "string" }, name: { type: "string" } } });
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL to the server's database.");
  const { PgStore } = await import("./pg-store.ts");
  const store = await PgStore.connect(url);
  try {
    switch (positionals[0]) {
      case "create-trainer": {
        if (!values.username || !values.name) throw new Error("Give --username and --name; pipe the password on stdin.");
        await createTrainer(store, values.username.toLowerCase(), values.name, await readStdin());
        console.log(`Trainer ${values.username} created.`);
        break;
      }
      case "list-cohorts":
        for (const c of await store.listCohorts()) console.log(`${c.cohort_id}  ${c.name}  (${c.learners} learners)`);
        break;
      default:
        console.log("Commands: create-trainer --username <u> --name <n>  (password on stdin) | list-cohorts");
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
