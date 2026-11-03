import { expect, test } from "@playwright/test";
import { activeBotId, completeOnboarding, rpc, signup } from "./helpers";

test("does not ask for a GitHub star", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await signup(page, `star-prompt-${Date.now()}@rakazo.test`, "password12", "Sample");
  await completeOnboarding(page);
  await rpc(page, "onboarding/dismissFocus", { botId: activeBotId(page) });
  await page.evaluate(() => localStorage.setItem("rakazo.githubStarPrompt.sent", "5"));

  const composer = page.getByRole("combobox", { name: /Message/ });
  await composer.fill("What should I work on today?");
  await composer.press("Enter");

  const prompt = page.getByRole("complementary", { name: "Star on GitHub" });
  await expect(
    page
      .getByTestId("transcript")
      .getByTestId("message-user-bubble")
      .filter({ hasText: "What should I work on today?" }),
  ).toBeVisible();
  await expect(prompt).toHaveCount(0);
});
