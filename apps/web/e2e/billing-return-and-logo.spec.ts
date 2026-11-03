import { expect, test } from "@playwright/test";
import { captureScreenshot } from "./helpers";

test("the sign-in logo follows the theme", async ({
  page,
}, testInfo) => {
  await page.goto("/sign-in");
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
  await expect(page.getByRole("heading", { name: "Sign in to ALMA" })).toBeVisible();
  await expect(page.locator('img[src="/alma-logo-black.svg"]')).toBeVisible();
  await captureScreenshot(page, testInfo, "sign-in-light");

  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await expect(page.locator('img[src="/alma-logo-white.svg"]')).toBeVisible();
  await captureScreenshot(page, testInfo, "sign-in-dark");
});
