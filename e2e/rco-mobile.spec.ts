import { expect, test, type Page } from "@playwright/test";

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "mobile viewport should not require horizontal scrolling").toBeLessThanOrEqual(1);
}

test.describe("RCO representative mobile profiles", () => {
  test("completes the core learner entry flow with touch-sized controls", async ({ page }) => {
    await page.goto("/#/learner");
    await page.getByLabel("Your name").fill("RCO Tester");
    await page.getByLabel("Username").fill("rco-tester");
    await page.getByRole("button", { name: "Continue to missions" }).click();
    await expect(page.getByRole("heading", { name: "Welcome back, RCO." })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.getByRole("link", { name: /View mission/ }).click();
    await page.getByRole("link", { name: "Start mission" }).click();
    const redTeam = page.getByRole("button", { name: /Red Team/ });
    await expect(redTeam).toBeVisible();
    const box = await redTeam.boundingBox();
    expect(box?.height, "answer controls must meet the 44px mobile touch target").toBeGreaterThanOrEqual(44);
    await redTeam.focus();
    await page.keyboard.press("Enter");
    const feedback = page.locator("article [aria-live='polite']").filter({ hasText: /Correct.*mission insight saved locally/ });
    await expect(feedback).toBeFocused();
    await page.getByRole("button", { name: /Next question/ }).click();
    await expect(page.locator("article h2")).toBeFocused();
    await expectNoHorizontalOverflow(page);
  });

  test("shows the learner-safe offline state after connectivity changes", async ({ page, context }) => {
    await page.goto("/#/learner/sync");
    await context.setOffline(true);
    await expect(page.getByRole("heading", { name: /You are offline/ })).toBeVisible();
    await expect(page.getByText(/Keep working normally/)).toBeVisible();
    await context.setOffline(false);
  });

  test("keeps the trainer fixture overview contained on a narrow screen", async ({ page }) => {
    await page.goto("/#/trainer");
    await expect(page.getByRole("heading", { name: /See learning signals/ })).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("returns a friendly route fallback for an unknown link", async ({ page }) => {
    await page.goto("/#/not-a-real-route");
    await expect(page.getByRole("heading", { name: "That page is not available." })).toBeVisible();
    await expect(page.getByRole("link", { name: "Return to missions" })).toBeVisible();
  });

  test("matches the approved minimum-device learner visual baseline", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "RCO-Android10-2GB-viewport", "One visual baseline is sufficient for this local browser engine.");
    await page.goto("/#/learner");
    await page.getByLabel("Your name").fill("RCO Tester");
    await page.getByLabel("Username").fill("rco-tester");
    await page.getByRole("button", { name: "Continue to missions" }).click();
    await page.getByRole("link", { name: /View mission/ }).click();
    await page.getByRole("link", { name: "Start mission" }).click();
    const redTeam = page.getByRole("button", { name: /Red Team/ });
    await expect(redTeam).toBeVisible();
    await redTeam.click();
    await expect(page.getByText(/Correct.*mission insight saved locally/)).toBeVisible();
    await page.evaluate(async () => { await document.fonts.ready; });
    await expect(page).toHaveScreenshot("rco-minimum-learner-flow.png", { animations: "disabled", fullPage: true, maxDiffPixelRatio: 0.01 });
  });
});
