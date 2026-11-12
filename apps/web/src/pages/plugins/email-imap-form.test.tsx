// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EmailImapForm } from "./email-imap-form";

const api = vi.hoisted(() => ({
  emailImap: { detect: vi.fn(), test: vi.fn(), save: vi.fn() },
}));

vi.mock("../../lib/rpc", () => ({ rpc: api }));
vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: ReactNode }) => children,
  useLingui: () => ({
    i18n: { locale: "en" },
    t: (parts: TemplateStringsArray, ...values: unknown[]) =>
      parts.reduce(
        (text, part, index) => text + (index ? String(values[index - 1]) : "") + part,
        "",
      ),
  }),
}));

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  api.emailImap.detect.mockReset();
  api.emailImap.test.mockReset();
  api.emailImap.save.mockReset();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function render(locale?: string) {
  await act(async () => {
    root.render(
      <EmailImapForm locale={locale} onBack={() => undefined} onSaved={() => undefined} />,
    );
  });
}

function field(id: string): HTMLInputElement {
  const direct = host.querySelector(`input#${id}`);
  if (direct instanceof HTMLInputElement) return direct;
  const nested = host.querySelector(`#${id}`)?.querySelector("input");
  if (nested instanceof HTMLInputElement) return nested;
  throw new Error(`${id} is ${host.querySelector(`#${id}`)?.tagName ?? "missing"}`);
}

async function type(id: string, value: string) {
  const element = field(id);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    (
      element as HTMLInputElement & { _valueTracker?: { setValue: (next: string) => void } }
    )._valueTracker?.setValue("different");
    setter.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function blur(id: string) {
  await act(async () => {
    field(id).dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
}

it("uses Spanish for the form and keeps the app-password line", async () => {
  await render("es");
  expect(host.textContent).toContain("Correo (IMAP/SMTP)");
  expect(host.textContent).toContain("contraseña de aplicación");
  expect(host.textContent).not.toContain("Incoming server");
});

it("hides the server fields when detection succeeds and shows them when it does not", async () => {
  api.emailImap.detect.mockResolvedValueOnce({
    detected: true,
    username: "ada@example.test",
    imap: { host: "imap.example.test", port: 993, security: "ssl" },
    smtp: { host: "smtp.example.test", port: 587, security: "starttls" },
  });
  await render("en");
  await type("email-imap-address", "ada@example.test");
  await blur("email-imap-address");
  await vi.waitFor(() => expect(api.emailImap.detect).toHaveBeenCalled());
  expect(host.textContent).toContain("Change servers");
  expect(host.querySelector("#incoming-server-host")).toBeNull();

  api.emailImap.detect.mockResolvedValueOnce({ detected: false });
  await type("email-imap-address", "ada@unknown.test");
  await blur("email-imap-address");
  expect(host.textContent).toContain("Incoming server");
  expect(host.querySelector("#incoming-server-host")).not.toBeNull();
});

it("shows the password error and does not offer save until the test succeeds", async () => {
  api.emailImap.detect.mockResolvedValue({ detected: false });
  api.emailImap.test.mockResolvedValue({ ok: false, code: "wrong_password", side: "imap" });
  await render("en");
  await type("email-imap-address", "ada@example.test");
  await blur("email-imap-address");
  await type("email-imap-password", "secret");
  await type("incoming-server-host", "imap.example.test");
  await type("outgoing-server-host", "smtp.example.test");
  const button = [...host.querySelectorAll("button")].find(
    (item) => item.textContent === "Test connection",
  );
  await act(async () => button?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  expect(host.textContent).toContain("The password was not accepted.");
  expect(host.textContent).not.toContain("Save");
});
