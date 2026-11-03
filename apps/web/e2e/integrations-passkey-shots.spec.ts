import { test as base, expect } from "@playwright/test";
import { captureScreenshot, completeOnboarding, signup } from "./helpers";

// Loopback deployments use the WebAuthn relying party `localhost`.
const test = base.extend({
  baseURL: async ({ baseURL }, use) => {
    const url = new URL(baseURL ?? "http://127.0.0.1:5173");
    url.hostname = "localhost";
    await use(url.origin);
  },
});

test("screenshots the passkey offer and the integrations panel", async ({ page }, testInfo) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });

  await signup(page, `shots-${Date.now()}@example.test`, "password12", "Shots Person");
  await completeOnboarding(page);
  await page.waitForURL(/\/app\/[^/]+$/);

  const offer = page.getByTestId("passkey-offer");
  await expect(offer).toBeVisible();
  await expect(offer.getByRole("button", { name: "Add passkey" })).toBeVisible();
  await expect(offer.getByRole("button", { name: "Dismiss" })).toBeVisible();
  const connect = page.getByRole("button", { name: "Connect apps", exact: true });
  await expect(connect).toBeVisible();
  const offerBox = await offer.boundingBox();
  const connectBox = await connect.boundingBox();
  expect(offerBox && connectBox && offerBox.y < connectBox.y).toBe(true);
  await captureScreenshot(page, testInfo, "passkey-offer");

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "Connect apps", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Integrations", exact: true });
  await expect(dialog.getByPlaceholder("Search apps")).toBeVisible();
  await expect(dialog.getByTestId("featured-connectors")).toContainText("Gmail");
  await expect(dialog.getByText("Popular", { exact: true })).toHaveCount(0);
  await expect(dialog.getByTestId("mcp-registry")).toHaveCount(0);
  await captureScreenshot(page, testInfo, "integrations-desktop");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog.getByPlaceholder("Search apps")).toBeVisible();
  await captureScreenshot(page, testInfo, "integrations-phone");
});
