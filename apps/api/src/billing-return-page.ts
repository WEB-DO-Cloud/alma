import { MOBILE_BILLING_CALLBACK_URL } from "@rakazo/contracts";

const ANDROID_PACKAGE = "do.alma.app";
const ANDROID_RETURN_URL = `intent://billing#Intent;scheme=rakazo;package=${ANDROID_PACKAGE};end`;

export type BillingReturnCopy = {
  title: string;
  button: string;
};

/** Spanish when the first Accept-Language tag is Spanish; otherwise English. */
export function billingReturnLanguage(acceptLanguage: string | undefined): "es" | "en" {
  const tag = acceptLanguage?.split(",")[0]?.split(";")[0]?.trim().toLowerCase() ?? "";
  return tag === "es" || tag.startsWith("es-") ? "es" : "en";
}

export function billingReturnCopy(language: "es" | "en", canceled: boolean): BillingReturnCopy {
  if (language === "es") {
    return {
      title: canceled ? "Pago cancelado" : "Pago completado",
      button: "Volver a ALMA",
    };
  }
  return {
    title: canceled ? "Payment canceled" : "Payment complete",
    button: "Back to ALMA",
  };
}

/** Android Custom Tabs need an intent URL. Everywhere else uses the app scheme. */
export function billingReturnTarget(userAgent: string | undefined): string {
  return /Android/i.test(userAgent ?? "") ? ANDROID_RETURN_URL : MOBILE_BILLING_CALLBACK_URL;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** A page the in-app browser can show, with a button that hands control back to the app. */
export function billingReturnPage(input: {
  acceptLanguage?: string;
  userAgent?: string;
  canceled?: boolean;
}): string {
  const copy = billingReturnCopy(
    billingReturnLanguage(input.acceptLanguage),
    input.canceled === true,
  );
  const target = escapeHtml(billingReturnTarget(input.userAgent));
  const title = escapeHtml(copy.title);
  const button = escapeHtml(copy.button);
  const language = billingReturnLanguage(input.acceptLanguage);
  return `<!doctype html>
<html lang="${language}">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: system-ui, sans-serif; background: #fff; color: #141414; }
  @media (prefers-color-scheme: dark) { body { background: #141414; color: #fff; } a { background: #fff; color: #141414; } }
  main { width: min(100% - 48px, 24rem); text-align: center; }
  h1 { font-size: 1.75rem; font-weight: 560; letter-spacing: -0.02em; }
  a { display: block; margin-top: 1.5rem; padding: 1rem 1.25rem; border-radius: 999px; background: #002D62; color: #fff; font-size: 1.25rem; font-weight: 600; text-decoration: none; }
</style>
<main>
  <h1>${title}</h1>
  <a href="${target}">${button}</a>
</main>
<script>location.replace(${JSON.stringify(billingReturnTarget(input.userAgent))});</script>
`;
}
