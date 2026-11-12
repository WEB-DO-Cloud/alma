import { expect, test } from "@playwright/test";
import { captureScreenshot, completeOnboarding, signup } from "./helpers";

const mailbox = {
  connectorId: "email-imap",
  slug: "email",
  name: "Email (IMAP/SMTP)",
  logo: null,
  connected: false,
  noAuth: false,
};

test("the mailbox form shows detected servers, manual servers, and a password error", async ({
  page,
}, testInfo) => {
  await signup(page, `imap-${Date.now()}@rakazo.test`, "password12", "Mailbox");
  await completeOnboarding(page);
  await page.route("**/rpc/connections/catalog", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    const items = Array.isArray(body?.json) ? body.json : [];
    await route.fulfill({
      response,
      json: {
        ...body,
        json: [
          mailbox,
          ...items.filter((item: { connectorId?: string }) => item.connectorId !== "email-imap"),
        ],
      },
    });
  });
  await page.route("**/rpc/emailImap/detect", async (route) => {
    const payload = route.request().postDataJSON() as { json?: { email?: string } };
    const email = payload.json?.email ?? "";
    await route.fulfill({
      json: {
        json: email.includes("unknown")
          ? { detected: false }
          : {
              detected: true,
              username: email,
              imap: { host: "imap.example.test", port: 993, security: "ssl" },
              smtp: { host: "smtp.example.test", port: 587, security: "starttls" },
            },
      },
    });
  });
  await page.route("**/rpc/emailImap/test", async (route) => {
    await route.fulfill({
      json: { json: { ok: false, code: "wrong_password", side: "imap" } },
    });
  });

  await page.getByRole("button", { name: "Connect apps", exact: true }).click();
  const row = page
    .locator("div.flex.items-center")
    .filter({ hasText: "Email (IMAP/SMTP)" })
    .last();
  await row.getByRole("button", { name: "Add", exact: true }).click();
  const form = page.getByTestId("email-imap-form");
  await expect(form.getByLabel("Email")).toBeVisible();
  await form.getByLabel("Email").fill("ada@example.test");
  await form.getByLabel("Email").blur();
  await expect(form.getByRole("button", { name: "Change servers" })).toBeVisible();
  await expect(
    form.getByText("If this account uses two-step verification, use an app password."),
  ).toBeVisible();
  await captureScreenshot(page, testInfo, "email-imap-detected");

  await form.getByLabel("Email").fill("ada@unknown.test");
  await form.getByLabel("Email").blur();
  await expect(form.getByLabel("Incoming server")).toBeVisible();
  await captureScreenshot(page, testInfo, "email-imap-manual");

  await form.getByLabel("Incoming server").fill("imap.example.test");
  await form.getByLabel("Outgoing server").fill("smtp.example.test");
  await form.getByLabel("Password").fill("secret");
  await form.getByRole("button", { name: "Test connection" }).click();
  await expect(form.getByText("The password was not accepted.")).toBeVisible();
  await captureScreenshot(page, testInfo, "email-imap-error");
});
