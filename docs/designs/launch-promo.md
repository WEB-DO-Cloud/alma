# Launch promo

*   **Status:** In review
*   **Date:** 2026-11-04

## Overview

A new subscriber on the monthly own-key plan can be offered a repeating Stripe coupon. The launch coupon is `lDZ3Qxvy`: $50 off, repeating for 3 months, so the $59 plan is $9 for the first three months and $59 after that. Annual checkout is unchanged. The coupon is optional. With the variable unset, checkout and the pricing screens behave as they do today.

## The switch

`STRIPE_PROMO_COUPON_ID` is optional and read next to `STRIPE_PRICE_ID`. It does not turn billing on. Billing still requires `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. The id is passed into the Stripe adapter as `promoCouponId`. An empty or whitespace value is treated as unset.

## Checkout

`createCheckout` and `createByokCheckout` apply the coupon only when `promoCouponId` is set and the price is monthly (interval `month`, count 1). The session then sends `discounts: [{ coupon }]`. Annual prices, and any checkout without the variable, keep `allow_promotion_codes: true`. Stripe rejects a session that sends both, so the adapter sends exactly one of them.

The legacy seat price is monthly only when its Stripe price says so. The own-key yearly interval is never discounted.

## What the screen is allowed to promise

`promoOffer(amountCents)` loads `GET /v1/coupons/{id}` and remembers the result for about 10 minutes. It returns `{ amountOffCents, months }` only when the coupon is valid, is a repeating USD amount off, has a positive month count, and covers the monthly plan's product. A coupon with no `applies_to` list covers every product. A restricted coupon must include the product on the existing monthly own-key price (`lookup_key` `rakazo_byok_monthly_{cents}`). Anything else, including a missing coupon, returns null. A Stripe outage is not cached, and billing status still loads.

Billing status adds `byokPromo: { priceCents, months } | null`. `priceCents` is the monthly plan minus `amountOffCents`. It is set only when `trialAvailable` is true, which is a new subscriber, and only when the result is still a positive price. Existing subscribers, a free plan, and a coupon that does not reduce the price get null. The field is optional on `BillingStatus` so an older server can omit it.

## Pricing UI

When `byokPromo` is set and the monthly price is the one on screen, web and the phone paywall show a "Launch offer" badge and the line "{promo}/month for your first {months} months, then {price}/month". The subscribe button uses the promo price. Spanish is "Oferta de lanzamiento" and "{promo}/mes durante tus primeros {months} meses, luego {price}/mes". The yearly choice does not show the offer, because that checkout does not send the coupon.

## What this does not do

The coupon is not applied to credits, top-ups, or a plan that is already subscribed. The adapter does not create or edit the coupon. A restricted coupon must already list the monthly plan's product, or checkout will fail when Stripe refuses it. Unset stays the upstream path: promotion codes stay enabled, and no badge is rendered.
