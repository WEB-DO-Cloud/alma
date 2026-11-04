import { describe, expect, it } from "vitest";
import { StripeBillingProvider, stripeBillingConfigFromEnv } from "./stripe-billing.js";
import { StripeEmulator } from "./testing/stripe-emulator.js";

const urls = { successUrl: "https://app.example/ok", cancelUrl: "https://app.example/no" };
const owner = { email: "owner@example.com", organizationId: "org_1" };

function providerFor(wire: StripeEmulator, promoCouponId?: string, now = () => Date.now()) {
  return new StripeBillingProvider({
    secretKey: wire.secretKey,
    webhookSecret: "whsec_fake",
    priceId: wire.priceId,
    ...(promoCouponId ? { promoCouponId } : {}),
    fetch: wire.fetch,
    now,
  });
}

describe("stripeBillingConfigFromEnv launch coupon", () => {
  const configured = { stripeSecretKey: "sk_test_fake", stripeWebhookSecret: "whsec_fake" };

  it("leaves the coupon off when the variable is unset or blank", () => {
    expect(stripeBillingConfigFromEnv(configured)).toEqual({
      secretKey: "sk_test_fake",
      webhookSecret: "whsec_fake",
    });
    expect(stripeBillingConfigFromEnv({ ...configured, stripePromoCouponId: "  " })).toEqual({
      secretKey: "sk_test_fake",
      webhookSecret: "whsec_fake",
    });
    expect(stripeBillingConfigFromEnv({ stripePromoCouponId: "coupon_launch" })).toBeUndefined();
  });

  it("passes a trimmed coupon id when billing is configured", () => {
    expect(
      stripeBillingConfigFromEnv({ ...configured, stripePromoCouponId: " coupon_launch " }),
    ).toEqual({
      secretKey: "sk_test_fake",
      webhookSecret: "whsec_fake",
      promoCouponId: "coupon_launch",
    });
  });
});

describe("launch coupon on checkout", () => {
  it("sends the coupon on a monthly seat checkout and promotion codes when it is off", async () => {
    const wire = new StripeEmulator();
    const { customerId } = await providerFor(wire).createCustomer(owner);
    await providerFor(wire).createCheckout({ customerId, seats: 1, ...urls });
    expect(wire.requests.at(-1)!.form).toMatchObject({ allow_promotion_codes: "true" });
    expect(wire.requests.at(-1)!.form).not.toHaveProperty("discounts[0][coupon]");

    const discounted = providerFor(wire, "coupon_launch");
    await discounted.createCheckout({ customerId, seats: 1, ...urls });
    const form = wire.requests.at(-1)!.form;
    expect(form["discounts[0][coupon]"]).toBe("coupon_launch");
    expect(form).not.toHaveProperty("allow_promotion_codes");
    expect(wire.sessions.at(-1)!.status).toBe("open");
  });

  it("keeps promotion codes on an annual seat price even when the coupon is set", async () => {
    const wire = new StripeEmulator();
    wire.priceInterval = "year";
    const provider = providerFor(wire, "coupon_launch");
    const { customerId } = await provider.createCustomer(owner);
    await provider.createCheckout({ customerId, seats: 1, ...urls });
    expect(wire.requests.at(-1)!.form).toMatchObject({ allow_promotion_codes: "true" });
    expect(wire.requests.at(-1)!.form).not.toHaveProperty("discounts[0][coupon]");
  });

  it("refuses a session that sends both a coupon and promotion codes", async () => {
    const wire = new StripeEmulator();
    wire.customers.set("cus_ok", { id: "cus_ok", email: "owner@example.com", deleted: false });
    const response = await wire.fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { authorization: `Bearer ${wire.secretKey}` },
      body: "customer=cus_ok&allow_promotion_codes=true&discounts[0][coupon]=coupon_launch",
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { message: expect.stringContaining("allow_promotion_codes") },
    });
  });
});

function byokProvider(promoCouponId?: string) {
  const requests: Array<{ path: string; params: URLSearchParams }> = [];
  const provider = new StripeBillingProvider({
    secretKey: "sk_test_fixture",
    webhookSecret: "whsec_fixture",
    ...(promoCouponId ? { promoCouponId } : {}),
    fetch: async (input, init) => {
      const url = new URL(String(input));
      requests.push({
        path: url.pathname,
        params: new URLSearchParams(String(init?.body ?? "")),
      });
      if (url.pathname === "/v1/prices" && init?.method === "POST")
        return Response.json({ id: "price_byok" });
      if (url.pathname === "/v1/checkout/sessions" && init?.method === "POST")
        return Response.json({ url: "https://checkout.example.test/session" });
      return Response.json({ data: [], has_more: false });
    },
  });
  return { provider, requests };
}

describe("launch coupon on the own-key plan", () => {
  const checkout = {
    customerId: "cus_fixture",
    amountCents: 5900,
    successUrl: urls.successUrl,
    cancelUrl: urls.cancelUrl,
  };

  it("discounts a monthly plan and leaves a yearly plan on promotion codes", async () => {
    const monthly = byokProvider("coupon_launch");
    await monthly.provider.createByokCheckout(checkout);
    const month = monthly.requests.at(-1)!.params;
    expect(month.get("discounts[0][coupon]")).toBe("coupon_launch");
    expect(month.has("allow_promotion_codes")).toBe(false);

    const yearly = byokProvider("coupon_launch");
    await yearly.provider.createByokCheckout({ ...checkout, amountCents: 14400, interval: "year" });
    const year = yearly.requests.at(-1)!.params;
    expect(year.get("allow_promotion_codes")).toBe("true");
    expect(year.has("discounts[0][coupon]")).toBe(false);

    const off = byokProvider();
    await off.provider.createByokCheckout(checkout);
    expect(off.requests.at(-1)!.params.get("allow_promotion_codes")).toBe("true");
    expect(off.requests.at(-1)!.params.has("discounts[0][coupon]")).toBe(false);
  });
});

describe("promoOffer", () => {
  function coupon(
    wire: StripeEmulator,
    overrides: Partial<{
      valid: boolean;
      amount_off: number | null;
      duration: "forever" | "once" | "repeating";
      duration_in_months: number | null;
      applies_to: { products: string[] };
    }> = {},
  ) {
    wire.coupons.set("coupon_launch", {
      valid: overrides.valid ?? true,
      amount_off: overrides.amount_off === undefined ? 5000 : overrides.amount_off,
      duration: overrides.duration ?? "repeating",
      duration_in_months:
        overrides.duration_in_months === undefined ? 3 : overrides.duration_in_months,
      ...(overrides.applies_to ? { applies_to: overrides.applies_to } : {}),
    });
  }

  it("returns the amount and months when the coupon covers the plan product", async () => {
    const wire = new StripeEmulator();
    coupon(wire, { applies_to: { products: ["prod_plan"] } });
    wire.planPrices.push({
      id: "price_byok",
      lookup_key: "rakazo_byok_monthly_5900",
      unit_amount: 5900,
      interval: "month",
      product: "prod_plan",
    });
    const provider = providerFor(wire, "coupon_launch");
    await expect(provider.promoOffer(5900)).resolves.toEqual({ amountOffCents: 5000, months: 3 });
  });

  it("returns null unless the coupon is a valid repeating amount off for this product", async () => {
    const missing = new StripeEmulator();
    await expect(providerFor(missing, "coupon_launch").promoOffer(5900)).resolves.toBeNull();

    const invalid = new StripeEmulator();
    coupon(invalid, { valid: false });
    await expect(providerFor(invalid, "coupon_launch").promoOffer(5900)).resolves.toBeNull();

    const once = new StripeEmulator();
    coupon(once, { duration: "once", duration_in_months: null });
    await expect(providerFor(once, "coupon_launch").promoOffer(5900)).resolves.toBeNull();

    const other = new StripeEmulator();
    coupon(other, { applies_to: { products: ["prod_other"] } });
    other.planPrices.push({
      id: "price_byok",
      lookup_key: "rakazo_byok_monthly_5900",
      unit_amount: 5900,
      interval: "month",
      product: "prod_plan",
    });
    await expect(providerFor(other, "coupon_launch").promoOffer(5900)).resolves.toBeNull();
  });

  it("covers every product when the coupon is not restricted, and caches for about ten minutes", async () => {
    let now = 0;
    const wire = new StripeEmulator();
    coupon(wire);
    const provider = providerFor(wire, "coupon_launch", () => now);
    await expect(provider.promoOffer(5900)).resolves.toEqual({ amountOffCents: 5000, months: 3 });
    const reads = () => wire.requests.filter((request) => request.path.startsWith("/v1/coupons"));
    expect(reads()).toHaveLength(1);
    await provider.promoOffer(5900);
    expect(reads()).toHaveLength(1);
    now = 10 * 60 * 1000;
    await provider.promoOffer(5900);
    expect(reads()).toHaveLength(2);
    await expect(providerFor(wire).promoOffer(5900)).resolves.toBeNull();
  });
});
