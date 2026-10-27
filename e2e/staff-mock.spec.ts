import { expect, test } from "@playwright/test";

test("mock staff workflow is keyboard-safe and horizontally contained", async ({ page }) => {
  await page.goto("/#/staff/sign-in");
  await page.getByLabel("Username").fill("demo");
  await page.getByLabel("Password").fill("demo-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: /Welcome, Demo SuperAdmin/ })).toBeVisible();
  await page.getByRole("link", { name: "Cohorts and Students" }).click();
  await page.getByRole("button", { name: "Archive Alex Rivera" }).click();
  await expect(page.getByRole("dialog", { name: "Archive Alex Rivera?" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Archive Alex Rivera" })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

test("mock content validation and Student no-assignment states are understandable", async ({ page }) => {
  await page.goto("/#/staff/sign-in");
  await page.getByLabel("Username").fill("demo");
  await page.getByLabel("Password").fill("demo-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.goto("/#/staff/content?scenario=upload-invalid");
  await expect(page.getByText("Module needs correction")).toBeVisible();
  await page.goto("/#/learner/missions?scenario=no-assigned-modules");
  await expect(page.getByRole("heading", { name: "No assigned missions" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});
