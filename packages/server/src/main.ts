/**
 * Start the API.
 *   node src/main.ts
 * With DATABASE_URL set it uses PostgreSQL (and applies migrations);
 * without it, an in-memory store for local demos.
 */

import { createServer } from "node:http";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { ContentRegistry } from "./content.ts";
import { MemoryStore } from "./memory-store.ts";
import type { Store } from "./store.ts";

const config = loadConfig();
let store: Store;
if (config.databaseUrl) {
  const { PgStore } = await import("./pg-store.ts");
  store = await PgStore.connect(config.databaseUrl);
} else {
  console.warn("DATABASE_URL is not set: using the in-memory store. Data is lost when the server stops.");
  store = new MemoryStore();
  const demoPassword = process.env.DEMO_STAFF_PASSWORD ?? process.env.DEMO_TRAINER_PASSWORD;
  if (demoPassword) {
    const { seedDemoStaff } = await import("./admin.ts");
    await seedDemoStaff(store, demoPassword);
  }
}

// Seeds the repo's modules into an empty database; afterwards modules are published through the staff API.
const content = await ContentRegistry.open(store, config.contentDir);

const server = createServer(createApp({ store, content, config }));
server.requestTimeout = 30_000;
server.listen(config.port, () => {
  console.log(`Tetherless API listening on :${config.port} with ${content.count} module versions`);
});

const shutdown = (signal: string) => {
  console.log(`${signal} received; shutting down`);
  server.close(() => {
    store.close().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
