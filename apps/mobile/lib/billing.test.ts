import type { BillingStatus } from "@rakazo/contracts";
import { describe, expect, it, vi } from "vitest";
import { rpc } from "./api";
import {
  currentPlan,
  openBillingPage,
  ownKeyOffer,
  ownKeySubscriptionCents,
  planEndsAt,
  purchaseCompleted,
  subscribedPlan,
} from "./billing";
import { openAndroidBillingAuth } from "./billing-auth";

vi.mock("./api", () => ({ rpc: vi.fn() }));
vi.mock("./billing-auth", () => ({ openAndroidBillingAuth: vi.fn() }));
vi.mock("expo-web-browser", () => ({ openAuthSessionAsync: vi.fn() }));
vi.mock("react-native", () => ({ Linking: { openURL: vi.fn() } }));

function status(overrides: Partial<BillingStatus> = {}): BillingStatus {
  return {
    access: false,
    funding: null,
    byokPriceCents: 1000,
    byokFreeUntil: null,
    canManage: true,
    trialAvailable: true,
    trialDays: 7,
    state: "none",
    price: null,
    seats: 1,
    trialEndsAt: null,
    currentPeriodEndsAt: null,
    cancelAtPeriodEnd: false,
    hasCustomer: false,
    ...overrides,
  };
}

describe("own-key offer", () => {
  it("leads with the trial until it has been used", () => {
    expect(ownKeyOffer(status())).toBe("trial");
    expect(ownKeyOffer(status({ trialAvailable: false }))).toBe("subscribe");
  });

  it("asks a free period to subscribe rather than start a trial", () => {
    expect(ownKeyOffer(status({ byokFreeUntil: "2026-11-01T00:00:00.000Z" }))).toBe("subscribe");
  });

  it("needs no payment when the own-key plan is free", () => {
    expect(ownKeyOffer(status({ byokPriceCents: null }))).toBe("free");
  });
});

describe("plan end", () => {
  it("is the trial end while trialing", () => {
    const trialEndsAt = "2026-11-03T00:00:00.000Z";
    expect(planEndsAt(status({ state: "trialing", trialEndsAt }))).toBe(trialEndsAt);
  });

  it("is the period end only once the renewal is canceled", () => {
    const currentPeriodEndsAt = "2026-11-27T00:00:00.000Z";
    expect(planEndsAt(status({ state: "active", currentPeriodEndsAt }))).toBeNull();
    expect(
      planEndsAt(status({ state: "active", currentPeriodEndsAt, cancelAtPeriodEnd: true })),
    ).toBe(currentPeriodEndsAt);
  });
});

describe("current plan", () => {
  it("is only a plan the organization can run bots on", () => {
    expect(currentPlan(status({ funding: "byok" }))).toBeNull();
    expect(currentPlan(status({ access: true, funding: "byok" }))).toBe("byok");
    expect(currentPlan(status({ access: true, funding: "credits" }))).toBe("credits");
  });
});

describe("purchase completed", () => {
  it("is a checkout that grants access", () => {
    expect(purchaseCompleted(status(), status({ access: true, state: "trialing" }))).toBe(true);
    expect(purchaseCompleted(status(), status())).toBe(false);
  });

  it("is not a canceled checkout from a free period that still has access", () => {
    const free = status({
      access: true,
      funding: "byok",
      byokFreeUntil: "2026-11-01T00:00:00.000Z",
    });
    expect(purchaseCompleted(free, free)).toBe(false);
    expect(
      purchaseCompleted(free, status({ access: true, funding: "byok", state: "active" })),
    ).toBe(true);
  });

  it("is a change from own key to monthly credits", () => {
    const ownKey = status({ access: true, funding: "byok", state: "active" });
    expect(
      purchaseCompleted(
        ownKey,
        status({ access: true, funding: "credits", state: "active", monthlyAmountCents: 2000 }),
      ),
    ).toBe(true);
  });
});

describe("subscribed plan", () => {
  it("marks a live own-key plan and shows the price it was bought at", () => {
    const own = status({ access: true, funding: "byok", state: "active", byokPriceCents: 1000 });
    expect(subscribedPlan(own)).toBe("byok");
    expect(ownKeySubscriptionCents(own)).toBe(1000);
  });

  it("does not treat a lapsed monthly credit plan with a balance left as current", () => {
    const lapsed = status({
      access: true,
      funding: "credits",
      state: "canceled",
      monthlyAmountCents: 2000,
      balanceUsd: 5,
    });
    expect(subscribedPlan(lapsed)).toBeNull();
    expect(subscribedPlan({ ...lapsed, state: "active" })).toBe("credits");
  });

  it("shows no own-key price for a subscription that is not on the own-key plan", () => {
    expect(ownKeySubscriptionCents(status({ access: true, state: "active" }))).toBeNull();
  });
});

describe("checkout return", () => {
  it("refreshes after the Auth Tab closes and does not open a second browser", async () => {
    vi.mocked(openAndroidBillingAuth).mockResolvedValue(true);
    vi.mocked(rpc).mockResolvedValue(status({ access: true }));
    const { openAuthSessionAsync } = await import("expo-web-browser");
    await expect(openBillingPage("https://checkout.example/pay")).resolves.toMatchObject({
      access: true,
    });
    expect(openAndroidBillingAuth).toHaveBeenCalledWith("https://checkout.example/pay");
    expect(openAuthSessionAsync).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("billing/refresh");
  });

  it("uses the in-app browser when the Auth Tab is unavailable, then refreshes", async () => {
    vi.mocked(openAndroidBillingAuth).mockResolvedValue(false);
    vi.mocked(rpc).mockResolvedValue(status());
    const { openAuthSessionAsync } = await import("expo-web-browser");
    await openBillingPage("https://checkout.example/pay");
    expect(openAuthSessionAsync).toHaveBeenCalledWith(
      "https://checkout.example/pay",
      "rakazo://billing",
      { preferEphemeralSession: true },
    );
    expect(rpc).toHaveBeenCalledWith("billing/refresh");
  });
});
