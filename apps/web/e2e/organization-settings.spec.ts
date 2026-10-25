import { expect, test } from "@playwright/test";
import { captureScreenshot, completeOnboarding, openUserSettings, signup } from "./helpers";

test("an organization admin saves the firm details shown on drafts for review", async ({
  page,
}, testInfo) => {
  const stamp = Date.now();
  await signup(page, `org-settings-${stamp}@rakazo.test`, "password12", "Org Admin");
  await completeOnboarding(page);
  const settings = await openUserSettings(page, "organization");
  const form = settings.getByTestId("organization-settings");
  await expect(form.getByTestId("organization-legal-name")).toBeVisible();

  await form.getByTestId("organization-legal-name").fill("Bufete Ejemplo SRL");
  await form.getByTestId("organization-trade-name").fill("Ejemplo Legal");
  await form.getByTestId("organization-rnc").fill("131123456");
  await form.getByTestId("organization-address").fill("Calle El Conde 12");
  await form.getByTestId("organization-city").fill("Santo Domingo, Distrito Nacional");
  await form.getByTestId("organization-phone").fill("+1 809 555 0100");
  await form.getByTestId("organization-email").fill("oficina@ejemplo.test");
  await form.getByTestId("organization-website").fill("https://ejemplo.test");
  await form.getByTestId("organization-add-lawyer").click();
  const lawyers = form.getByTestId("organization-lawyers");
  await lawyers.getByLabel("Name").fill("Ana Pérez");
  await lawyers.getByLabel("CARD number").fill("12345");
  await lawyers.getByLabel("Email").fill("ana@ejemplo.test");
  await form.getByTestId("organization-bank").fill("Banco Ejemplo");
  await form.getByTestId("organization-bank-account").fill("000123456");
  await form.getByTestId("organization-invoice-footer").fill("Pago a 15 días.");
  await form.getByTestId("organization-accent").fill("#1F4B3A");
  await form.getByTestId("organization-save").click();
  await expect(form.getByText("Saved", { exact: true })).toBeVisible();
  await expect(form.getByTestId("organization-rnc")).toHaveValue("1-31-12345-6");

  await page.reload();
  const again = await openUserSettings(page, "organization");
  await expect(again.getByTestId("organization-legal-name")).toHaveValue("Bufete Ejemplo SRL");
  await expect(again.getByTestId("organization-rnc")).toHaveValue("1-31-12345-6");
  await expect(again.getByTestId("organization-lawyers").getByLabel("Name")).toHaveValue(
    "Ana Pérez",
  );
  await captureScreenshot(page, testInfo, "organization-settings");
});
