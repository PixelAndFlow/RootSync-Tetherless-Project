import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "mobile viewport should not require horizontal scrolling").toBeLessThanOrEqual(1);
}

const correctChoiceIndexes = [1, 0, 2, 1, 1, 1, 0, 2, 3, 0, 1, 0, 0, 1, 1];

async function answerMission(page: Page, choiceIndexes: number[]) {
  for (const [questionIndex, choiceIndex] of choiceIndexes.entries()) {
    const answers = page.locator("article").first().getByRole("button");
    await answers.nth(choiceIndex).click();
    await expect(page.locator("article [aria-live='polite']")).toBeVisible();
    if (questionIndex < choiceIndexes.length - 1) {
      await page.getByRole("button", { name: /Next question/ }).click();
    }
  }
}

test.describe("RCO representative mobile profiles", () => {
  test("completes the core learner entry flow with touch-sized controls", async ({ page }) => {
    await page.goto("/#/learner");
    await page.getByLabel("Your name").fill("RCO Tester");
    await page.getByLabel("Username").fill("rco-tester");
    await page.getByRole("button", { name: "Continue to missions" }).click();
    await expect(page.getByRole("heading", { name: "Welcome back, RCO." })).toBeVisible();
    await expect(page.getByText("Device storage check")).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.getByRole("link", { name: /Start mission/ }).click();
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

  test("sorts and filters trainer fixture learners without changing their data", async ({ page }) => {
    await page.goto("/#/trainer");
    await page.getByLabel("Sort learners").selectOption("mastery_desc");
    await expect(page.locator("tbody tr").first()).toContainText("Sam Ortiz");
    await page.getByLabel("Search learners").fill("nobody");
    await expect(page.getByText("No fixture learners match this filter.")).toBeVisible();
  });

  test("returns a friendly route fallback for an unknown link", async ({ page }) => {
    await page.goto("/#/not-a-real-route");
    await expect(page.getByRole("heading", { name: "That page is not available." })).toBeVisible();
    await expect(page.getByRole("link", { name: "Return to missions" })).toBeVisible();
  });

  test("does not substitute a different mission for an invalid mission link", async ({ page }) => {
    await page.goto("/#/learner/missions/not-a-real-mission/play");
    await expect(page.getByRole("heading", { name: "That page is not available." })).toBeVisible();
    await expect(page.getByText("Operation Cyber Squad")).not.toBeVisible();
  });

  test("persists learner display preferences without changing the mission data", async ({ page }) => {
    await page.goto("/#/learner");
    await page.getByLabel("Your name").fill("RCO Tester");
    await page.getByLabel("Username").fill("rco-tester");
    await page.getByRole("button", { name: "Continue to missions" }).click();
    await page.getByText("Display preferences", { exact: true }).click();
    await page.getByRole("button", { name: "High contrast: Off" }).click();
    await page.getByRole("button", { name: "Reduce motion: Off" }).click();
    await expect(page.locator(".app-high-contrast")).toBeVisible();
    await expect(page.locator(".app-reduced-motion")).toBeVisible();
    await expect(page.getByText("Operation Cyber Squad")).toBeVisible();
  });

  test("keeps sticky mission navigation below the site header on desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/#/learner");
    await page.getByLabel("Your name").fill("RCO Tester");
    await page.getByLabel("Username").fill("rco-tester");
    await page.getByRole("button", { name: "Continue to missions" }).click();
    await page.getByRole("link", { name: /Start mission/ }).click();
    await page.getByRole("link", { name: "Start mission" }).click();
    await page.evaluate(() => window.scrollTo(0, 500));

    const headerBox = await page.locator("header.app-header").boundingBox();
    const navigationBox = await page.locator("main aside").first().boundingBox();
    expect(headerBox).not.toBeNull();
    expect(navigationBox).not.toBeNull();
    expect(navigationBox!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height + 8);
  });

  test("keeps learner and trainer routes legible in both explicit colour themes", async ({ page }) => {
    await page.goto("/#/learner");
    await page.getByLabel("Your name").fill("RCO Tester");
    await page.getByLabel("Username").fill("rco-tester");
    await page.getByRole("button", { name: "Continue to missions" }).click();
    await page.getByText("Display preferences", { exact: true }).click();
    await page.getByRole("button", { name: "Light mode" }).click();
    await expect(page.locator(".app-light-theme")).toBeVisible();
    await expect(page.getByRole("link", { name: "Missions" })).toHaveCSS("color", "rgb(255, 255, 255)");
    await expect(page.locator(".app-status-chip")).toHaveCSS("background-color", "rgb(90, 30, 228)");

    const lightResults = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
    expect(lightResults.violations).toEqual([]);

    await page.getByRole("link", { name: /Start mission/ }).click();
    await expect(page.getByRole("heading", { name: "What you’ll learn" })).toBeVisible();
    await expect(page.getByText("Four checkpoints. Complete them in order.")).toBeVisible();
    await expect(page.getByText("15 questions")).toHaveCSS("border-color", "rgb(133, 133, 133)");
    await expect(page.getByText("No timer")).toHaveCSS("border-color", "rgb(133, 133, 133)");
    await expect(page.getByRole("link", { name: "Start mission" })).toHaveCSS("color", "rgb(255, 255, 255)");
    await page.getByRole("link", { name: "Start mission" }).click();
    await expect(page.getByRole("heading", { name: /Which cybersecurity team/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Next question/ })).toBeDisabled();
    await expect(page.getByRole("button", { name: /Next question/ })).toHaveCSS("color", "rgb(255, 255, 255)");
    await expect(page.getByRole("button", { name: /Next question/ })).toHaveCSS("background-color", "rgb(90, 30, 228)");
    const lightFlagAction = page.getByRole("button", { name: "Flag for review" });
    await expect(lightFlagAction).toHaveAttribute("aria-pressed", "false");
    await expect(lightFlagAction).toHaveCSS("border-color", "rgb(90, 30, 228)");
    await lightFlagAction.click();
    await expect(page.getByRole("button", { name: "Flagged for review" })).toHaveAttribute("aria-pressed", "true");
    await page.locator("main aside").first().getByRole("button", { name: "Question 4" }).click();
    const neutralAnswer = page.locator("article").first().getByRole("button", { name: /Good intentions/ });
    await expect(neutralAnswer).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(neutralAnswer).toHaveCSS("color", "rgb(30, 30, 30)");
    const lightMissionResults = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
    expect(lightMissionResults.violations).toEqual([]);

    await page.goto("/#/trainer");
    await expect(page.getByRole("heading", { name: /See learning signals/ })).toBeVisible();
    await expect(page.locator(".app-light-theme")).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.goto("/#/learner/missions");
    await page.getByText("Display preferences", { exact: true }).click();
    await page.getByRole("button", { name: "Dark mode" }).click();
    await expect(page.locator(".app-light-theme")).toHaveCount(0);
    await expect(page.getByText("Operation Cyber Squad")).toBeVisible();
    await page.getByRole("link", { name: /Start mission/ }).click();
    await page.getByRole("link", { name: "Start mission" }).click();
    const darkFlagAction = page.getByRole("button", { name: "Flag for review" });
    await expect(page.getByRole("button", { name: /Next question/ })).toBeDisabled();
    await expect(page.getByRole("button", { name: /Next question/ })).toHaveCSS("color", "rgb(255, 255, 255)");
    await expect(page.getByRole("button", { name: /Next question/ })).toHaveCSS("background-color", "rgb(70, 49, 141)");
    await expect(darkFlagAction).toHaveCSS("border-color", "rgb(90, 30, 228)");
    await darkFlagAction.click();
    await expect(page.getByRole("button", { name: "Flagged for review" })).toHaveAttribute("aria-pressed", "true");
  });

  test("exposes answer selection and feedback state to assistive technology", async ({ page }) => {
    await page.goto("/#/learner");
    await page.getByLabel("Your name").fill("RCO Tester");
    await page.getByLabel("Username").fill("rco-tester");
    await page.getByRole("button", { name: "Continue to missions" }).click();
    await page.getByRole("link", { name: /Start mission/ }).click();
    await page.getByRole("link", { name: "Start mission" }).click();
    const redTeam = page.getByRole("button", { name: /Red Team/ });
    await expect(redTeam).toHaveAttribute("aria-pressed", "false");
    await redTeam.click();
    await expect(page.getByRole("button", { name: /Red Team\. Correct answer/ })).toBeDisabled();
    await expect(page.locator("article [aria-live='polite']")).toContainText("Correct");
  });

  test("moves from the skip link to the main landmark by keyboard", async ({ page }) => {
    await page.goto("/#/learner");
    await page.keyboard.press("Tab");
    const skipLink = page.getByRole("link", { name: "Skip to main content" });
    await expect(skipLink).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();
  });

  test("protects the full learner record through practice, review, and retry", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "RCO-Android10-2GB-viewport", "The complete workflow is exercised once on the minimum Android viewport; core checks run on every profile.");
    await page.goto("/#/learner");
    await page.getByLabel("Your name").fill("RCO Tester");
    await page.getByLabel("Username").fill("rco-tester");
    await page.getByRole("button", { name: "Continue to missions" }).click();
    await page.getByRole("link", { name: /Start mission/ }).click();
    await page.getByRole("link", { name: "Start mission" }).click();

    await answerMission(page, [0, ...correctChoiceIndexes.slice(1)]);
    await page.getByRole("button", { name: "View mission debrief" }).click();
    await expect(page.getByText("93.3%").first()).toBeVisible();
    await expect(page.getByText("Current mastery", { exact: true })).toBeVisible();

    await page.getByRole("link", { name: "Practice missed questions" }).click();
    await page.locator("article").first().getByRole("button").nth(correctChoiceIndexes[0]).click();
    await page.getByRole("button", { name: "Update mastery" }).click();
    await expect(page.getByText("100%").first()).toBeVisible();
    await expect(page.getByText("93.3%").first()).toBeVisible();

    await page.getByRole("link", { name: "Review initially missed" }).click();
    await expect(page.getByRole("heading", { name: "Review initially missed answers" })).toBeVisible();
    await expect(page.getByText("Question 1 of 1")).toBeVisible();
    await page.getByRole("link", { name: "Back to debrief" }).click();

    await page.getByRole("link", { name: "Try all questions again" }).click();
    await answerMission(page, correctChoiceIndexes);
    await page.getByRole("button", { name: "View mission debrief" }).click();
    await expect(page.getByText("93.3%").first()).toBeVisible();
    await expect(page.getByText("100%").first()).toBeVisible();
    await expect(page.getByText("Attempts saved locally")).toBeVisible();
  });

  test("matches the approved mobile learner visual baseline", async ({ page }) => {
    test.slow();
    await page.goto("/#/learner");
    await page.getByLabel("Your name").fill("RCO Tester");
    await page.getByLabel("Username").fill("rco-tester");
    await page.getByRole("button", { name: "Continue to missions" }).click();
    await page.getByRole("link", { name: /Start mission/ }).click();
    await page.getByRole("link", { name: "Start mission" }).click();
    const redTeam = page.getByRole("button", { name: /Red Team/ });
    await expect(redTeam).toBeVisible();
    await redTeam.click();
    await expect(page.getByText(/Correct.*mission insight saved locally/)).toBeVisible();
    await page.evaluate(async () => { await document.fonts.ready; });
    await page.addStyleTag({ content: ".app-header { position: static !important; backdrop-filter: none !important; }" });
    await expect(page).toHaveScreenshot("rco-minimum-learner-flow.png", { animations: "disabled", fullPage: true, maxDiffPixelRatio: 0.01 });
  });

  test("meets selected WCAG mobile accessibility checks", async ({ page }) => {
    await page.goto("/#/learner");
    const results = await new AxeBuilder({ page }).withRules(["aria-allowed-attr", "aria-valid-attr-value", "button-name", "color-contrast", "heading-order", "label", "landmark-one-main", "link-name", "page-has-heading-one"]).analyze();
    expect(results.violations).toEqual([]);
  });

  test("exposes install metadata without claiming offline caching is active", async ({ page }) => {
    await page.goto("/#/learner");
    await expect(page.locator("link[rel='manifest']")).toHaveAttribute("href", "/manifest.webmanifest");
    const manifestResponse = await page.request.get("/manifest.webmanifest");
    expect(manifestResponse.ok()).toBe(true);
    const manifest = await manifestResponse.json();
    expect(manifest).toMatchObject({ name: "Tetherless - RCO Cyber Learning", display: "standalone", start_url: "/#/learner" });
    expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
  });
});
