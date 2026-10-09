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
    await redTeam.click();
    await expect(page.getByText(/Correct.*mission insight saved locally/)).toBeVisible();
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
});
