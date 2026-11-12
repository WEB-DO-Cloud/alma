import { expect, test } from "@playwright/test";
import {
  captureScreenshot,
  completeOnboarding,
  openUserSettings,
  readRouteJson,
  signup,
} from "./helpers";

test("bot style stays available when bootstrap omits the saved preference", async ({
  page,
}, testInfo) => {
  await page.route("**/rpc/bootstrap", async (route) => {
    const fetched = await readRouteJson(route);
    if (!fetched) return;
    const response = fetched.response;
    const body = fetched.body;
    delete body.json.me.botAvatarSet;
    await route.fulfill({ response, json: body });
  });
  await signup(page, `bot-style-${Date.now()}@rakazo.test`, "password12", "Tester");
  await completeOnboarding(page);
  const settings = await openUserSettings(page);
  const picker = settings.getByTestId("bot-style-select");
  const original = picker.getByRole("button", { name: "Original", exact: true });
  const alma = picker.getByRole("button", { name: "ALMA", exact: true });
  await expect(original).toBeVisible();
  await expect(original).toHaveAttribute("aria-pressed", "false");
  await alma.click();
  await expect(alma).toHaveAttribute("aria-pressed", "true");
  await original.click();
  await expect(original).toHaveAttribute("aria-pressed", "true");
  await captureScreenshot(page, testInfo, "bot-style-original");
  await page.unroute("**/rpc/bootstrap");
  await page.reload();
  await openUserSettings(page);
  await expect(
    page.getByTestId("bot-style-select").getByRole("button", { name: "Original", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});
