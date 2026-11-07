-- Reward-free attribution timestamps. Nullable, so the previous release can ignore them.

ALTER TABLE "referrals" ADD COLUMN "activatedAt" TIMESTAMP(3);
ALTER TABLE "referrals" ADD COLUMN "paidAt" TIMESTAMP(3);
