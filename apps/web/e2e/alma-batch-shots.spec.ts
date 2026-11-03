import { expect, test } from "@playwright/test";
import { captureScreenshot, completeOnboarding, rpc, signup } from "./helpers";

test("docs, report, and call controls are on the signed-in app", async ({ page }, testInfo) => {
  const stamp = Date.now();
  await signup(page, `alma-batch-${stamp}@rakazo.test`, "password12", "ALMA Batch");
  await completeOnboarding(page);

  await page.goto("/docs");
  await expect(page.getByRole("heading", { name: "Documentación de ALMA" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Getting started" })).toBeVisible();
  await captureScreenshot(page, testInfo, "docs-index");

  await page.goto("/app");
  await page.waitForURL(/\/app\/[^/]+$/);
  const composer = page.getByRole("combobox", { name: /^Message/ });
  await composer.fill("Reply so this response can be reported.");
  await composer.press("Enter");
  const bubble = page.getByTestId("message-bot-bubble").last();
  await expect(bubble).toContainText("Reply so this response can be reported.", {
    timeout: 20_000,
  });
  const row = bubble.locator("xpath=ancestor::*[@data-message-id][1]");
  const rail = row.getByTestId("message-hover-rail");
  await expect
    .poll(async () => {
      await row.hover();
      return rail.evaluate((element) => getComputedStyle(element).opacity);
    })
    .toBe("1");
  await rail.getByRole("button", { name: "More" }).click();
  await expect(page.getByRole("menuitem", { name: "Report response" })).toBeVisible();
  await captureScreenshot(page, testInfo, "report-response");
  await page.keyboard.press("Escape");

  await rpc(page, "voice/connect", { provider: "scripted", apiKey: "fake-call-voice-key" });
  await page.reload();
  await page.waitForURL(/\/app\/[^/]+$/);
  const callButton = page.getByTestId("call-button");
  await expect(callButton).toHaveAttribute("data-voice-ready", "");
  await callButton.click();
  await expect(page.getByTestId("call-view")).toBeVisible();
  await captureScreenshot(page, testInfo, "call-controls");
});
