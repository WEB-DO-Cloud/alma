import * as z from "zod";
import type { ComputerSize } from "./computer.js";
import { ComputerSizeSchema } from "./computer.js";

export const MODEL_CREDIT_AMOUNTS = [1000, 2000, 3000, 5000, 10000, 20000, 50000] as const;

/**
 * What an hour of a billed computer counts against the allowance, $0.20, whatever its size: above
 * a small cloud machine's raw price, so the allowance also covers storage and saves.
 */
export const SANDBOX_HOURLY_COST_MICROS = 200_000;
/** What a trial may spend on computers, in cents; ending the trial early starts the full allowance. */
export const TRIAL_SANDBOX_ALLOWANCE_CENTS = 200;
/** The share of a monthly credit plan an organization may also spend on computers. */
export const CREDITS_SANDBOX_ALLOWANCE_PERCENT = 20;

/** Computer hours an allowance in cents buys. */
export function sandboxAllowanceHours(allowanceCents: number): number {
  return (allowanceCents * 10_000) / SANDBOX_HOURLY_COST_MICROS;
}

export const ByokTierSchema = z.enum(["standard", "pro", "max"]);
export type ByokTier = z.infer<typeof ByokTierSchema>;

export interface ByokTierTerms {
  name: string;
  /** Monthly price in cents; `null` on Standard makes the own-model plan free, and hides any other tier. */
  monthlyPriceCents: number | null;
  /** Yearly price in cents; `null` offers the tier monthly only. */
  annualPriceCents: number | null;
  /** What the organization may spend on computers each month, in cents. */
  computerAllowanceCents: number;
  computerSize: ComputerSize;
}

/**
 * ALMA sells one own-model plan at USD 59. Standard is what new organizations start on.
 * Pro and Max stay in the type but are not offered: upstream prices them at $49 and $99,
 * and $49 would undercut the plan people already buy. `null` hides a tier.
 * `0` in `BYOK_MONTHLY_PRICE_CENTS` makes the plan free and hides every tier.
 */
export const BYOK_MONTHLY_PRICE_CENTS: number | null = 5900;
export const BYOK_TIERS: Record<ByokTier, ByokTierTerms> = {
  standard: {
    name: "Standard",
    monthlyPriceCents: BYOK_MONTHLY_PRICE_CENTS,
    annualPriceCents: null,
    computerAllowanceCents: 500,
    computerSize: "standard",
  },
  pro: {
    name: "Pro",
    monthlyPriceCents: null,
    annualPriceCents: null,
    computerAllowanceCents: 2000,
    computerSize: "large",
  },
  max: {
    name: "Max",
    monthlyPriceCents: null,
    annualPriceCents: null,
    computerAllowanceCents: 4000,
    computerSize: "xlarge",
  },
};

/** Server price for the standard plan. Unset uses {@link BYOK_MONTHLY_PRICE_CENTS}. `0` is free. */
export function resolveByokMonthlyPriceCents(
  settings: NodeJS.ProcessEnv = process.env,
): number | null {
  const raw = settings.BYOK_MONTHLY_PRICE_CENTS?.trim();
  if (raw === "0") return null;
  if (raw && /^[1-9]\d*$/.test(raw)) return Number(raw);
  return BYOK_MONTHLY_PRICE_CENTS;
}

/** The tier's price for new subscriptions billed every `interval`; null when it is not offered. */
export function byokTierPriceCents(tier: ByokTier, interval: ByokInterval): number | null {
  const standardMonthly = resolveByokMonthlyPriceCents();
  if (standardMonthly === null) return null;
  if (tier === "standard") {
    return interval === "year" ? BYOK_TIERS.standard.annualPriceCents : standardMonthly;
  }
  const terms = BYOK_TIERS[tier];
  if (terms.monthlyPriceCents === null) return null;
  return interval === "year" ? terms.annualPriceCents : terms.monthlyPriceCents;
}
/**
 * An invited friend's first trial, in weeks; the invite copy and the trial both read it. The copy
 * is written for a plural number of weeks, so check its wording in every language if this changes.
 */
export const INVITED_TRIAL_WEEKS = 2;
/** Length of a new organization's free trial of the own-model plan, in days. */
export const TRIAL_DAYS = 7;
export const ByokIntervalSchema = z.enum(["month", "year"]);
export type ByokInterval = z.infer<typeof ByokIntervalSchema>;
export const DEFAULT_MONTHLY_CREDIT_AMOUNT = 3000;
export const ModelCreditAmountSchema = z.union(
  MODEL_CREDIT_AMOUNTS.map((amount) => z.literal(amount)),
);

/** Where checkout returns: the mobile app's in-app browser instead of the web app. */
export const BillingClientSchema = z.literal("mobile").optional();
/** The deep link the API sends a mobile checkout back to; it closes the in-app browser. */
export const MOBILE_BILLING_CALLBACK_URL = "rakazo://billing";

export const BILLING_CANCELLATION_REASONS = [
  "too_expensive",
  "missing_features",
  "switched_service",
  "unused",
  "customer_service",
  "too_complex",
  "low_quality",
  "other",
] as const;
export type BillingCancellationReason = (typeof BILLING_CANCELLATION_REASONS)[number];

export const BillingStatusSchema = z.object({
  funding: z.enum(["byok", "credits"]).nullable().optional(),
  balanceUsd: z.number().optional(),
  monthlyAmountCents: z.number().int().positive().nullable().optional(),
  creditPurchasesEnabled: z.boolean().optional(),
  /** Monthly price of the own-key plan, as subscribed when the organization has it; `null` when free. */
  byokPriceCents: z.number().int().positive().nullable().optional(),
  /** How often `byokPriceCents` bills. Absent from older servers, which bill monthly. */
  byokInterval: ByokIntervalSchema.optional(),
  /** Yearly price of the own-key plan's tier for new subscriptions, when offered. */
  byokAnnualPriceCents: z.number().int().positive().nullable().optional(),
  /** The own-key plan's tier: the subscribed one, else Standard. Absent from older servers. */
  byokTier: ByokTierSchema.optional(),
  /**
   * Discounted monthly price for a new subscriber's first months. Absent from older servers,
   * and null when no launch coupon covers the plan.
   */
  byokPromo: z
    .object({
      priceCents: z.number().int().positive(),
      months: z.number().int().positive(),
    })
    .nullable()
    .optional(),
  /** The tiers on offer, in order; absent when the own-key plan is free. */
  byokTiers: z
    .array(
      z.object({
        tier: ByokTierSchema,
        name: z.string(),
        monthlyPriceCents: z.number().int().positive(),
        annualPriceCents: z.number().int().positive().nullable(),
        computerSize: ComputerSizeSchema,
        computerHours: z.number().nonnegative(),
      }),
    )
    .optional(),
  /** End of an unpaid own-key organization's free period. */
  byokFreeUntil: z.string().nullable().optional(),
  access: z.boolean(),
  /** Only organization owners start checkout or open the billing portal. */
  canManage: z.boolean(),
  trialAvailable: z.boolean(),
  trialDays: z.number().int().nonnegative(),
  state: z.enum([
    "none",
    "trialing",
    "active",
    "past_due",
    "incomplete",
    "unpaid",
    "paused",
    "canceled",
  ]),
  price: z
    .object({
      amount: z.number().int().nonnegative(),
      currency: z.string(),
      interval: z.enum(["day", "week", "month", "year"]),
      intervalCount: z.number().int().positive(),
    })
    .nullable(),
  seats: z.number().int().nonnegative(),
  trialEndsAt: z.string().nullable(),
  currentPeriodEndsAt: z.string().nullable(),
  cancelAtPeriodEnd: z.boolean(),
  hasCustomer: z.boolean(),
  /**
   * No-card trial countdown. Absent from older servers, and null when this organization
   * has no trial or the trial flag is off.
   */
  almaTrial: z
    .object({
      endsAt: z.string(),
      messagesUsed: z.number().int().nonnegative(),
      messageCap: z.number().int().positive(),
      daysLeft: z.number().int().nonnegative(),
      messagesLeft: z.number().int().nonnegative(),
    })
    .nullable()
    .optional(),
  /** Renewal and currency sentences on the plan page. Absent from older servers. */
  planClarity: z.boolean().optional(),
  /** Computer hours left this calendar month; absent when computers have no limit. */
  computerHoursLeft: z.number().nonnegative().nullable().optional(),
  /** Present once the organization has subscribed: its invite link and free months earned. */
  referral: z
    .object({ url: z.string().url(), rewards: z.number().int().nonnegative() })
    .nullable()
    .optional(),
});
export type BillingStatus = z.infer<typeof BillingStatusSchema>;

/** A trial set to cancel, which gets no computer hours until it is renewed. */
export function isCancelledTrial(status: BillingStatus): boolean {
  return status.state === "trialing" && status.cancelAtPeriodEnd;
}

/** The percent a yearly own-key price saves over twelve months at `monthlyCents`. */
export function byokYearlySavingsPercent(monthlyCents: number, annualCents: number): number {
  return Math.round((1 - annualCents / (monthlyCents * 12)) * 100);
}

/**
 * What switching a paid monthly own-key plan to yearly saves, in percent, or null when the switch
 * is not offered: not the owner, no live monthly plan, or a yearly price that saves nothing.
 */
export function byokYearlySwitchSavings(status: BillingStatus): number | null {
  if (
    !status.canManage ||
    status.funding !== "byok" ||
    status.byokInterval === "year" ||
    status.byokFreeUntil ||
    status.monthlyAmountCents ||
    status.cancelAtPeriodEnd ||
    (status.state !== "active" && status.state !== "trialing") ||
    !status.byokPriceCents ||
    !status.byokAnnualPriceCents
  )
    return null;
  const savings = byokYearlySavingsPercent(status.byokPriceCents, status.byokAnnualPriceCents);
  return savings > 0 ? savings : null;
}

/**
 * Whether an owner can move the own-key plan to another tier: a paid-up plan with no monthly
 * credits that is not cancelling, and another tier to move to.
 */
export function byokTierChangeOffered(status: BillingStatus): boolean {
  return Boolean(
    status.canManage &&
      status.funding === "byok" &&
      !status.byokFreeUntil &&
      !status.monthlyAmountCents &&
      !status.cancelAtPeriodEnd &&
      (status.state === "active" || status.state === "trialing") &&
      status.byokPriceCents &&
      (status.byokTiers?.length ?? 0) > 1,
  );
}
