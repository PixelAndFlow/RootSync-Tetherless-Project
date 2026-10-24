import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("setup validation and failed codes do not create a profile", async ({ page }) => {
  await page.goto("/#/learner");
  await expect(page.getByLabel("Your name")).toHaveCount(0);
  await page.getByRole("button", { name: "Continue to missions" }).click();
  await expect(page.getByLabel("Setup code")).toHaveAttribute("aria-invalid", "true");
  await page.getByLabel("Setup code").fill("INVALID-CODE");
  await page.getByLabel("Username").fill("sample-user");
  await page.getByRole("button", { name: "Continue to missions" }).click();
  await expect(page.getByRole("alert")).toContainText("Check your setup code");
  expect(await page.evaluate(() => localStorage.getItem("tetherless.learner-profile.v1"))).toBeNull();
  await page.getByLabel("Setup code").fill("DEMO-2026");
  await page.getByRole("button", { name: "Continue to missions" }).click();
  await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible();
});

for (const theme of ["dark", "light"] as const) {
  test(`profile, preferences and quiz colors in ${theme} mode`, async ({ page }) => {
    await page.goto("/#/learner");
    await page.getByLabel("Setup code").fill("DEMO-2026");
    await page.getByLabel("Username").fill("Test Learner");
    await page.getByRole("button", { name: "Continue to missions" }).click();
    await page.getByRole("link", { name: "Profile and settings", exact: true }).click();
    await expect(page.getByText("DEMO-001", { exact: true })).toBeVisible();
    await expect(page.getByText("Frontend demo cohort", { exact: true })).toBeVisible();
    await page.getByText("Display preferences", { exact: true }).click();
    await page.getByRole("button", { name: theme === "light" ? "Light mode" : "Dark mode", exact: true }).click();
    const before = await page.evaluate(() => localStorage.getItem("tetherless.learner-profile.v1"));
    expect(before).not.toContain("DEMO-2026");
    expect(before).not.toContain("token");
    await page.reload();
    await expect(page.getByRole("heading", { name: "Profile and settings" })).toBeVisible();
    expect(JSON.parse((await page.evaluate(() => localStorage.getItem("tetherless.learner-profile.v1")))!).colorTheme).toBe(theme);
    // Exercise the graceful fallback deterministically rather than depending on OS clipboard permission.
    await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined }));
    await page.getByRole("button", { name: "Copy Student code" }).click();
    await expect(page.getByText(/copy it manually/)).toBeVisible();
    const accessibility = await new AxeBuilder({ page }).withRules(["color-contrast", "button-name", "label", "heading-order"]).analyze();
    expect(accessibility.violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: test.info().outputPath(`profile-${theme}.png`), fullPage: true });
    await page.getByRole("link", { name: "Return to missions" }).click();
    await page.getByRole("link", { name: /Start mission/ }).click();
    await page.getByRole("link", { name: "Start mission", exact: true }).click();
    const blue = page.getByRole("button", { name: /Blue Team/ });
    const red = page.getByRole("button", { name: /Red Team/ });
    await expect(blue).toHaveClass(/kahoot-answer-blue/);
    await expect(red).toHaveClass(/kahoot-answer-red/);
    const background = await blue.evaluate((el) => getComputedStyle(el).backgroundImage);
    await blue.click(); // Wrong answer must retain its assigned color too.
    await expect(blue).toHaveCSS("background-image", background);
    await page.getByRole("button", { name: /Next question/ }).click();
    await expect(page.locator("article h2")).toBeFocused();
    await expect(page.locator("article .kahoot-answer").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Flag for review" })).toBeVisible();
    const spanish = page.getByRole("button", { name: /Spanish support/ });
    await spanish.click();
    await expect(spanish).toHaveText(/On/);
  });
}
