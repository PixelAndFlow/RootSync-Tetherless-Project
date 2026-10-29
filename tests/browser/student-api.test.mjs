/**
 * Real browser + real local API + browser IndexedDB, with disposable data.
 * npm run test:student-api (requires installed Chrome; no deployed credentials).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { build, preview } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { chromium, expect } from "@playwright/test";
import { pwaShellPlugin } from "../../pwa-shell-plugin.ts";
import { createApp } from "../../packages/server/src/app.ts";
import { loadConfig } from "../../packages/server/src/config.ts";
import { ContentRegistry } from "../../packages/server/src/content.ts";
import { MemoryStore } from "../../packages/server/src/memory-store.ts";
import { createStaffAccount } from "../../packages/server/src/admin.ts";

test("assigned-module refresh, restarted attempt, offline relaunch, and synced report", { timeout: 180_000 }, async (t) => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const outDir = "node_modules/.cache/student-api-dist";
  const store = new MemoryStore();
  const config = loadConfig({ AUTH_RATE_LIMIT_PER_MINUTE: "1000" });
  const content = await ContentRegistry.open(store, config.contentDir);
  const password = "synthetic local browser test password";
  await createStaffAccount(store, { username: "browser-test", displayName: "Synthetic Test", role: "superadmin", password });
  const server = createServer(createApp({ store, content, config }));
  let frontend;
  let browser;
  try {
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    async function api(path, token, body) {
      const response = await fetch(`${base}${path}`, {
        method: body ? "POST" : "GET",
        headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      assert.ok(response.ok, `${path} returned ${response.status}`);
      return response.json();
    }
    const { token } = await api("/v1/staff/login", null, { username: "browser-test", password });
    const { cohort } = await api("/v1/staff/cohorts", token, { name: "Synthetic Browser Cohort" });
    const { learner, setup_code } = await api("/v1/staff/learners", token, { cohort_id: cohort.cohort_id, first_name: "Synthetic", last_name: "Student" });
    const module = content.body("phishing-basics", 1);
    assert.ok(module);

    // Separate output keeps the ordinary mock-mode dist and visual suite intact.
    await build({ root, configFile: false, logLevel: "silent", plugins: [react(), tailwindcss(), pwaShellPlugin()],
      define: { "import.meta.env.VITE_TETHERLESS_API_BASE_URL": JSON.stringify(base) },
      build: { outDir, emptyOutDir: true },
    });
    frontend = await preview({ root, configFile: false, logLevel: "silent", build: { outDir }, preview: { host: "127.0.0.1", port: 0 } });
    const origin = `http://127.0.0.1:${frontend.httpServer.address().port}`;
    config.corsOrigins.push(origin);
    t.diagnostic("Disposable API and production frontend are ready.");
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const context = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const page = await context.newPage();
    await page.goto(`${origin}/#/learner`);
    await page.getByLabel("Setup code").fill(setup_code);
    await page.getByLabel("Username", { exact: true }).fill("Synthetic Student");
    await page.getByRole("button", { name: "Continue to missions" }).click();
    await expect(page.getByRole("heading", { name: "No assigned missions" })).toBeVisible();
    t.diagnostic("Real setup and initial empty assignment list passed.");

    // This is the same app instance that already fetched the empty catalog.
    await api("/v1/staff/assignments", token, { module_id: "phishing-basics", content_version: 1, cohort_id: cohort.cohort_id });
    await page.evaluate(() => { location.hash = "/learner/sync"; });
    await expect(page.getByRole("button", { name: /Sync now|Retry sync/ })).toBeVisible();
    await page.getByRole("link", { name: "Return to missions", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Phishing Basics" })).toBeVisible();
    await page.getByRole("link", { name: /Start mission/ }).click();
    await page.getByRole("link", { name: "Start mission", exact: true }).click();
    await expect(page.locator("article h2")).toHaveText(module.questions[0].prompt.en);
    await page.getByRole("button", { name: `${module.questions[0].choices[0].en}.`, exact: true }).click();
    await expect(page.locator("article [aria-live='polite']")).toBeVisible();
    await page.getByRole("button", { name: "Exit mission", exact: true }).click();
    await page.getByRole("button", { name: "Exit to mission details", exact: true }).click();
    await page.getByRole("link", { name: "Start mission", exact: true }).click();

    for (const [index, question] of module.questions.entries()) {
      await expect(page.locator("article h2")).toHaveText(question.prompt.en);
      const correct = question.choices.find(choice => choice.id === question.correct_choice);
      await page.getByRole("button", { name: `${correct.en}.`, exact: true }).click();
      await expect(page.locator("article [aria-live='polite']")).toBeVisible();
      await page.getByRole("button", { name: index === module.questions.length - 1 ? "View mission debrief" : /Next question/ }).click();
    }
    await expect(page.getByRole("heading", { name: "Recruit Mission Debrief" })).toBeVisible();
    await expect(page.getByText("Initial score", { exact: true }).locator("..")).toContainText("100%");
    await expect(page.getByText("Your mission debrief is not ready yet.")).not.toBeVisible();
    t.diagnostic("New assignment and completed result after restart passed.");

    // The production app shell and actual module package must survive a reload.
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await page.evaluate(() => { location.hash = "/learner/missions"; });
    await expect(page.getByRole("heading", { name: "Phishing Basics" })).toBeVisible();
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Phishing Basics" })).toBeVisible();
    await page.getByRole("link", { name: /Start mission/ }).click();
    await expect(page.getByRole("heading", { name: "Phishing Basics", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Start mission", exact: true }).click();
    await expect(page.locator("article h2")).toHaveText(module.questions[0].prompt.en);

    await context.setOffline(false);
    t.diagnostic("Installed app shell and downloaded module reopened offline.");
    await page.evaluate(() => { location.hash = "/learner/sync"; });
    const sync = page.getByRole("button", { name: /Sync now|Retry sync/ });
    await expect(sync).toBeVisible();
    if (await sync.isEnabled()) await sync.click();
    await expect.poll(async () => {
      const report = await api(`/v1/staff/learners/${learner.learner_id}/report`, token);
      return report.modules.find(m => m.module_id === "phishing-basics")?.initial?.pct;
    }, { timeout: 15_000 }).toBe(100);
  } finally {
    await browser?.close();
    if (frontend) await new Promise(resolve => frontend.httpServer.close(resolve));
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await store.close();
  }
});
