import { expect, test } from "@playwright/test";
import { captureScreenshot, completeOnboarding, readRouteJson, signup } from "./helpers";

test("incoming calls show answer and decline controls in both themes", async ({
  page,
}, testInfo) => {
  await signup(page, `incoming-call-${Date.now()}@rakazo.test`, "password12", "Caller");
  await completeOnboarding(page);
  await page.route("**/rpc/spaces/list", async (route) => {
    const fetched = await readRouteJson(route);
    if (!fetched) return;
    const response = fetched.response;
    const body = fetched.body;
    const bot = body.json.current.bots[0];
    if (bot)
      bot.incomingCall = {
        callId: "00000000-0000-4000-8000-000000000001",
        reason: "Review the report",
        opening: "Hello",
        expiresAt: new Date(Date.now() + 45000).toISOString(),
      };
    await route.fulfill({ response, json: body });
  });
  await page.reload();
  const call = page.getByTestId("incoming-call");
  await expect(call.getByRole("button", { name: "Decline", exact: true })).toBeVisible();
  await expect(call.getByRole("button", { name: "Answer", exact: true })).toBeVisible();
  for (const theme of ["light", "dark"]) {
    await page.evaluate((theme) => {
      document.documentElement.classList.toggle("dark", theme === "dark");
      document.documentElement.dataset.theme = theme;
    }, theme);
    await captureScreenshot(page, testInfo, `incoming-call-${theme}`);
  }
});
