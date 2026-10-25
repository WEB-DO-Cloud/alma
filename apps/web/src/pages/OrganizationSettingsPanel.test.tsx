// @vitest-environment jsdom

import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";

const { get, update, uploadLogo, t } = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  uploadLogo: vi.fn(),
  t: (strings: TemplateStringsArray) => strings.join(""),
}));

vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({ t }),
  Trans: ({ children }: { children?: ReactNode }) => children,
}));

vi.mock("../lib/rpc", () => ({
  rpc: { organization: { get, update, uploadLogo } },
}));

import { OrganizationSettingsPanel } from "./OrganizationSettingsPanel";

const empty = {
  legalName: "Núñez & Asociados S.R.L.",
  tradeName: "Núñez",
  rnc: "",
  addressLine: "",
  cityProvince: "",
  phone: "",
  email: "",
  website: "",
  bankName: "",
  bankAccount: "",
  invoiceFooter: "",
  accentColor: null,
  logo: null,
  lawyers: [],
};

beforeEach(() => {
  get.mockReset();
  update.mockReset();
  uploadLogo.mockReset();
  get.mockResolvedValue(empty);
});

async function render() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<OrganizationSettingsPanel />);
  });
  await act(async () => {
    await Promise.resolve();
  });
  return {
    container,
    cleanup: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

it("shows the firm fields and does not save an invalid RNC", async () => {
  const { container, cleanup } = await render();
  try {
    expect(container.textContent).toContain("Legal name");
    expect(container.textContent).toContain("RNC");
    expect(container.textContent).toContain("Responsible lawyers");
    expect(container.textContent).toContain("Named lawyers who may approve drafts for review.");
    const rnc = container.querySelector<HTMLInputElement>('[data-testid="organization-rnc"]');
    if (!rnc) throw new Error("Missing RNC field");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(rnc, "1234");
      rnc.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const form = container.querySelector("form");
    if (!form) throw new Error("Missing form");
    await act(async () => {
      form.requestSubmit();
    });
    expect(container.textContent).toContain(
      "RNC must be 9 digits (company) or 11 digits (cédula).",
    );
    expect(update).not.toHaveBeenCalled();
  } finally {
    await cleanup();
  }
});
