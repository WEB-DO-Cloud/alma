import { expect, test } from "@playwright/test";
import { captureScreenshot, completeOnboarding, openUserSettings, signup } from "./helpers";

test("account settings omit model and voice, and integrations search the MCP registry", async ({
  page,
}, testInfo) => {
  await signup(page, `overlay-${Date.now()}@rakazo.test`, "password12", "Overlay");
  await completeOnboarding(page);

  const settings = await openUserSettings(page);
  await expect(settings.getByTestId("settings-nav-models")).toHaveCount(0);
  await expect(settings.getByTestId("settings-nav-voice")).toHaveCount(0);
  await expect(settings.getByTestId("settings-nav-general")).toBeVisible();
  await captureScreenshot(page, testInfo, "account-settings");
  await page.keyboard.press("Escape");

  await page.route("**/rpc/mcp/registry/search", (route) =>
    route.fulfill({
      json: {
        json: {
          servers: [
            {
              registryName: "com.notion/mcp",
              name: "Notion",
              description: "Search and edit your Notion workspace.",
              iconUrl: null,
              transport: "streamable_http",
              endpoint: "https://mcp.notion.com/mcp",
              needsHeader: false,
              headerName: null,
            },
          ],
        },
      },
    }),
  );
  await page.getByRole("button", { name: "Connect apps", exact: true }).click();
  const registry = page.getByTestId("mcp-registry");
  await expect(registry.getByText("Popular", { exact: true })).toBeVisible();
  await expect(registry.getByText("Gmail", { exact: true })).toBeVisible();
  await captureScreenshot(page, testInfo, "connectors-popular");
  await page.getByRole("textbox", { name: "Search apps" }).fill("notion");
  await expect(registry.getByText("Notion", { exact: true })).toBeVisible();
  await captureScreenshot(page, testInfo, "connectors-search");
});
