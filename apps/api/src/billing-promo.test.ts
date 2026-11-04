import { describe, expect, it } from "vitest";
import { byokLaunchPromo } from "./billing.js";

const offer = { amountOffCents: 5000, months: 3 };

describe("launch promo on billing status", () => {
  it("prices a new monthly subscriber at the coupon for the stated months", () => {
    expect(byokLaunchPromo(5900, offer)).toEqual({ priceCents: 900, months: 3 });
  });

  it("is absent when the coupon does not reduce the monthly price", () => {
    expect(byokLaunchPromo(5900, null)).toBeNull();
    expect(byokLaunchPromo(5000, offer)).toBeNull();
    expect(byokLaunchPromo(5900, { amountOffCents: 0, months: 3 })).toBeNull();
    expect(byokLaunchPromo(5900, { amountOffCents: 5000, months: 0 })).toBeNull();
    expect(byokLaunchPromo(5900, { amountOffCents: 50.5, months: 3 })).toBeNull();
  });
});
