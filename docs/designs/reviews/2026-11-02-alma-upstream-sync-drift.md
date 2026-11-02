# Drift check: upstream sync

*   **Document:** `docs/designs/alma-upstream-sync-2026-11.md`
*   **Date:** 2026-11-02
*   **Tree:** the merge of upstream `main` (`e28f4d4e`) onto the design commit, with the ALMA overlay reapplied

Compared the strategy, the nine overlay rules, and the verification list with the tree. No miss blocks the pull request. The notes below are the places the tree is more specific than the design.

## Strategy

The merge is two-parent. The first parent is the design commit on this branch. The second parent is upstream `main`. The index was taken from upstream with `git read-tree --reset -u MERGE_HEAD`, then the overlay was restored. `scripts/sync-upstream.sh` records that sequence. `scripts/check-alma-overlay.sh` and `scripts/alma-overlay-manifest.txt` are the done check the design asked for.

## Overlay

Sections 1–9 match the tree:

*   Product name, slug, bundle id, store title, splash, and version fields are the values in sections 1 and 6. `expo.version` is `1.0.12`, iOS build `64`, Android `versionCode` `13`.
*   The four Rakazo-link files stay deleted. Store hrefs and the hosted origin are the ALMA URLs. Self-host links point at `https://alma.com.do/self-hosted-ai-agent/`.
*   Managed model and xAI voice attach on the upstream executor and voice factory. Spoken summaries stay. The Call button stays. The phone composer has no Dictate control and no sample-data mode.
*   The Popular connector list, including MintMCP and Waystation, is the file from ALMA `HEAD`. It is mounted inside upstream's connectors screen and MCP dialog. Upstream's stdio refusal, duplicate-name conflict, and connect-from-approval-card flow stay.
*   Terms and privacy name Dominican Republic law and the courts of Santo Domingo, D.N. The privacy voice bullet names xAI and links `https://x.ai/legal/privacy-policy`.
*   Draft review, organization settings, and message reports stay, with their migrations. The phone menu that duplicated them stays absent.
*   Compose passes the ALMA model and voice env names next to `XAI_API_KEY`. `SIGNUPS_ENABLED` stays. The image keeps `chmod 1777 /tmp` and the optional `INSTALL_GROK_CLI=1` block.
*   `BYOK_MONTHLY_PRICE_CENTS` is `6900`. Unset uses that constant. A positive integer overrides it. `0` makes the own-key plan free. Checkout sends the resolved cents as Stripe `price_data.unit_amount`. `STRIPE_PRICE_ID` stays the legacy seat price. Spanish UI locale `es` formats the amount with `es-DO`, which renders `US$69`.

## Extra specificity

*   Model and Voice settings sections are hidden while managed model or operator voice is on. That is the condition section 3 asked for. The settings layout itself is upstream's.
*   `infra/compose/check-image.sh` no longer uses an awk interval `{40,}`. Ubuntu's awk rejects that form, and the image smoke test failed on it. The scan now checks `length(body) >= 40`. The rest of the script matches upstream.
*   Desktop type names `RakazoDesktop`, `RakazoSetup`, and `isRakazoHealth` stay spelled that way. A rebrand pass had left placeholder tokens in those identifiers. They were restored before typecheck.
*   The passkey test input that case-folds `RAKAZO_PASSKEY_RP_ID` stays `Rakazo.Example.org`. That string is the env host, not the product name.

## Verification

`pnpm check` passed. `pnpm lint` passed with existing warnings and no errors. `scripts/check-alma-overlay.sh` passed. The unit suite passed: 19919 tests, 706 skipped. Desktop Electron e2e was not run.

The local web harness started. One Playwright pass opened sign-in (`Sign in to ALMA`), a chat thread with the Call button, the connectors Popular grid (including MintMCP and Waystation), and the upgrade screen at locale `es` (`US$69 / mes`). The full web e2e suite was not run locally; CI runs it.
