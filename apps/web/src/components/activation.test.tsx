// @vitest-environment jsdom

import type { BillingStatus } from "@rakazo/contracts";
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { TrialBanner } from "./activation";

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children?: ReactNode }) => children ?? null,
  useLingui: () => ({
    t: (strings: TemplateStringsArray) => strings.join(""),
    i18n: { locale: "es" },
  }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const status = {
  access: true,
  canManage: true,
  trialAvailable: false,
  trialDays: 7,
  state: "none",
  price: null,
  seats: 1,
  trialEndsAt: null,
  currentPeriodEndsAt: null,
  cancelAtPeriodEnd: false,
  hasCustomer: false,
  almaTrial: {
    endsAt: "2030-01-01T00:00:00.000Z",
    messagesUsed: 3,
    messageCap: 50,
    daysLeft: 12,
    messagesLeft: 47,
  },
} satisfies BillingStatus;

afterEach(() => {
  document.body.innerHTML = "";
});

it("shows the trial countdown and upgrade action", async () => {
  const onUpgrade = vi.fn();
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => {
    root.render(<TrialBanner status={status} onUpgrade={onUpgrade} />);
  });
  expect(container.textContent).toContain("12");
  expect(container.textContent).toContain("47");
  container.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(onUpgrade).toHaveBeenCalledOnce();
  await act(async () => root.unmount());
});
