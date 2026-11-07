// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ me: vi.fn(), status: vi.fn() }));
vi.mock("../lib/rpc", () => ({ rpc: { me: api.me, billing: { status: api.status } } }));
vi.mock("../lib/bootstrap", () => ({ peekInitialBootstrap: () => undefined }));
vi.mock("../pages/Paywall", () => ({ PaywallPage: () => <div>paywall</div> }));
vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({ t: (strings: TemplateStringsArray) => strings.join("") }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Fresh module per test: the capability lookup is cached for the page's lifetime. */
async function renderGate(billing: boolean) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        billing,
        passwordAuth: true,
        sso: null,
        passwordReset: false,
        resetUrl: null,
      }),
    ),
  );
  vi.resetModules();
  const { SubscriptionGate } = await import("./SubscriptionGate");
  const { MemoryRouter } = await import("react-router-dom");
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter>
        <SubscriptionGate fallback={<div>loading</div>}>
          <div>app</div>
        </SubscriptionGate>
      </MemoryRouter>,
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return { container, root };
}

afterEach(() => {
  vi.clearAllMocks();
  api.status.mockReset();
  api.me.mockReset();
  vi.unstubAllGlobals();
});

it("opens without waiting on me or billing when the deployment does not bill", async () => {
  const { container, root } = await renderGate(false);
  expect(container.textContent).toBe("app");
  expect(api.me).not.toHaveBeenCalled();
  expect(api.status).not.toHaveBeenCalled();
  act(() => root.unmount());
});

it("skips the billing request for users billing does not apply to", async () => {
  api.me.mockResolvedValue({ billingEnabled: false });
  const { container, root } = await renderGate(true);
  expect(container.textContent).toBe("app");
  expect(api.status).not.toHaveBeenCalled();
  act(() => root.unmount());
});

it("updates the trial countdown when the open chat asks billing to refresh", async () => {
  api.me.mockResolvedValue({ billingEnabled: true });
  api.status
    .mockResolvedValueOnce({ access: true, almaTrial: { messagesLeft: 50, daysLeft: 14 } })
    .mockResolvedValueOnce({ access: true, almaTrial: { messagesLeft: 49, daysLeft: 14 } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        billing: true,
        passwordAuth: true,
        sso: null,
        passwordReset: false,
        resetUrl: null,
      }),
    ),
  );
  vi.resetModules();
  const { SubscriptionGate, useBilling } = await import("./SubscriptionGate");
  const { MemoryRouter } = await import("react-router-dom");
  function Count() {
    const billing = useBilling();
    return (
      <button type="button" onClick={() => void billing.refresh()}>
        {billing.status?.almaTrial?.messagesLeft}
      </button>
    );
  }
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter>
        <SubscriptionGate fallback={<div>loading</div>}>
          <Count />
        </SubscriptionGate>
      </MemoryRouter>,
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(container.textContent).toBe("50");

  await act(async () => {
    container.querySelector("button")?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(container.textContent).toBe("49");
  expect(api.status).toHaveBeenCalledTimes(2);
  act(() => root.unmount());
});

it("shows the paywall without access and opens once a recheck finds access", async () => {
  api.me.mockResolvedValue({ billingEnabled: true });
  api.status.mockResolvedValue({ access: false });
  const { container, root } = await renderGate(true);
  expect(container.textContent).toBe("paywall");

  api.status.mockResolvedValue({ access: true });
  await act(async () => {
    window.dispatchEvent(new Event("focus"));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(container.textContent).toBe("app");
  act(() => root.unmount());
});
