# Sync ALMA onto upstream Rakazo

-   **Status:** Implementing
-   **Date:** 2026-11-02
-   **Upstream:** `elie222/rakazo` `main` at `e28f4d4e` (2026-11-02)
-   **ALMA:** `WEB-DO-Cloud/alma` `main` at `de786890`
-   **Fork point:** `05c5d241` (2026-10-25)

Upstream `main` is 660 commits ahead of the fork point. ALMA `main` is 47 commits ahead of the same point. After this change, upstream is the tree, and ALMA is a listed overlay on top of it. One pull request merges into ALMA `main`. That pull request is not merged, deployed, or submitted to a store from this work.

Goldfish review: `docs/designs/reviews/2026-11-02-alma-upstream-sync.md`.

## Strategy

Branch `cursor/upstream-sync-2026-11-dd22` from ALMA `main`. The merge commit has two parents: the previous ALMA tip, then `upstream/main`. Do not `git reset`, do not `git checkout` the branch name, and do not `git merge --abort` after the merge starts. Those drop `MERGE_HEAD` and make a one-parent commit, which would merge the 47 ALMA commits a second time.

Commands, in order:

```
git merge --no-commit upstream/main || true
git read-tree --reset -u MERGE_HEAD
```

`read-tree` makes the index and the worktree match upstream. `HEAD` is still the ALMA tip, so `git checkout HEAD -- <path>` restores an ALMA file without ending the merge.

Then apply the overlay in three sets:

1. **Restore.** A path ALMA added, or a path ALMA edited whose blob on `upstream/main` equals its blob at `05c5d241`. Copy it from `HEAD`. Upstream did not change these, so the ALMA file is the overlay.
2. **Delete.** Remove these four paths even if upstream still has them. They are the Rakazo download, star card, and mark:
   -   `apps/www/api/download.ts`
   -   `apps/www/public/brand/rakazo-mark.png`
   -   `apps/www/src/components/RepoCard.astro`
   -   `apps/www/src/github.ts`
3. **Surgical.** A path both sides changed after `05c5d241`. Leave the upstream bytes in place. Re-apply only the rule in the matching section below. Do not copy the ALMA file over the upstream file.

`whole` means set 1 (the path is absent on `upstream/main`, or upstream's blob equals the fork-point blob). `surgical` means set 3. A path that exists on both sides is never `whole`.

`scripts/alma-overlay-manifest.txt` is written after the overlay, one path per line, prefixed `restore`, `delete`, or `surgical`. It is the path list. This document is the rule list. A path may differ from `upstream/main` only when it is in that manifest, or it matches one of these globs:

-   `apps/web/src/locales/**`
-   `apps/web/scripts/translations-*.json`
-   `apps/mobile/lib/locales/**`
-   `pnpm-lock.yaml`
-   `docs/designs/alma-upstream-sync-2026-11.md`
-   `docs/designs/reviews/2026-11-02-alma-upstream-sync.md`
-   `scripts/sync-upstream.sh`
-   `scripts/alma-overlay-manifest.txt`
-   `scripts/check-alma-overlay.sh`

Finish the merge only when `git status` shows no unmerged paths. `git add -A` includes the restored files. The commit's first parent is the previous ALMA tip and its second parent is `upstream/main`.

`scripts/sync-upstream.sh` repeats these steps against a later `upstream/main`. `scripts/check-alma-overlay.sh` fails the tree when any of these are true. Comparisons are numeric, not lexicographic.

-   `packages/contracts/src/domain.ts` does not set `BYOK_MONTHLY_PRICE_CENTS` to `5900`.
-   `apps/mobile/app.json` `expo.version` is below `1.0.12`, `expo.ios.buildNumber` is below `66`, or `expo.android.versionCode` is below `14`.
-   The phone composer source contains a Dictate or Dictar control, or a sample-data mode is referenced from the phone home screen. The check looks at `apps/mobile/app/thread.tsx` and `apps/mobile/app/_layout.tsx`, not the whole repo.
-   `git diff --name-only upstream/main` lists a tracked path outside the manifest and outside the globs above.
-   A rendered product string in `apps/web/src`, `apps/mobile/app`, `apps/mobile/lib/locales`, `apps/www/src`, or `README.md` says `Rakazo` and the line is not an allowlisted identifier from section 2.

## Overlay rules

### 1. Rebrand

On surgical files, replace the visible product token only.

| Slot                                                                                         | Text                                                         |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `expo.name`, PWA `name`, desktop `productName`, a title whose whole text is the product name | `ALMA`                                                       |
| `expo.slug`                                                                                  | `alma`                                                       |
| iOS `bundleIdentifier` and Android `applicationId`                                           | `do.alma.app`                                                |
| Store listing title (`apps/mobile/fastlane/metadata/**/name.txt` and `title.txt`)            | `ALMA Asistente IA`                                          |
| Sign-in title                                                                                | `Sign in to ALMA`. Spanish catalog: `Inicia sesión en ALMA`. |
| Splash `backgroundColor` in `apps/mobile/app.json`                                           | `#002D62`                                                    |

`apps/mobile/app.json` `scheme` is `["alma", "rakazo"]`. Icons point at the ALMA rasters already used on ALMA `main`.

These identifiers stay spelled as upstream spells them, and the check in the strategy section allows them: npm scope `@rakazo`, the database name, `RAKAZO_*` env keys, the `rakazo://` scheme, native class names that contain `Rakazo`, the directory `packages/ui-tokens/assets/Rakazo.icon`, `LICENSE`, import paths, test fixtures that name the module, and `docs/designs/**`.

`es` stays a UI locale on web and mobile and is listed first in the locale array. Locales upstream added, including `zh-TW`, stay in that array. When nothing is saved and the device reports no language, the fallback stays `en`. Do not set a new default that forces `es`.

### 2. No Rakazo links

Delete the four paths in the strategy section. Remove user-facing links that target them.

No user-facing link to the Rakazo GitHub repository, the Rakazo Android APK, or a Rakazo star count. Do not present a Rakazo self-host document as this product. Self-host links in the marketing pages point at `https://alma.com.do/self-hosted-ai-agent/`.

Store hrefs, from `packages/contracts/src/client-build.ts`:

-   iOS: `https://apps.apple.com/app/id6829162072`
-   Android: `https://play.google.com/store/apps/details?id=do.alma.app`

Hosted app origin: `https://app.alma.com.do` (`apps/www/src/site.ts` `APP_URL`, desktop setup cloud URL).

Every client that has not been pointed at another server uses that origin. The phone falls back to it when `EXPO_PUBLIC_API_URL` is unset (`apps/mobile/lib/server-config.ts`, the iOS shortcut Info.plist value, and the EAS production profile). The web app calls the origin it was loaded from. Desktop setup offers the same cloud URL. OAuth and MCP callbacks use that deployment's origin. The public integrations catalog, when `INTEGRATIONS_CATALOG_URL` is unset, stays `https://integrations.sh`. Self-update tracks `https://github.com/WEB-DO-Cloud/alma` and `ghcr.io/web-do-cloud/alma`. In-app docs use `https://alma.com.do`. Integrations hides Submit a plugin: `SUBMIT_PLUGIN_URL` is null. A hosted `sentry.io` DSN is refused on the phone; error reporting uses the server's collector or stays off. The marketing integrations catalog is the committed snapshot `apps/www/public/integrations/catalog.json`, served at `https://alma.com.do/integrations/catalog.json`. `CATALOG_URL` overrides that file. `scripts/sync-integrations-catalog.py` refreshes the snapshot on each upstream sync. Nothing in the app calls `registry.modelcontextprotocol.io`.

The About credits sentences that named Rakazo were removed with the phone About screen and stay removed. Do not add them back.

### 3. Model and voice

`ALMA_MANAGED_MODEL` unset means on. `0`, `false`, `no`, and `off` turn it off. `ALMA_VOICE_PROVIDER` unset means off. Only the value `xai` turns operator voice on. Managed model does not change `ALMA_VOICE_PROVIDER`.

Restore these files from ALMA `HEAD` (they are absent on upstream):

-   `packages/adapters/src/grok-build-runtime.ts`
-   `packages/adapters/src/grok-build-runtime.test.ts`
-   `packages/adapters/src/managed-model.ts`
-   `packages/adapters/src/managed-model.test.ts`
-   `packages/adapters/src/managed-voice.ts`
-   `packages/adapters/src/create-managed-runtime.ts`
-   `packages/adapters/src/unavailable-managed-runtime.ts`
-   `packages/adapters/src/xai-voice.ts`
-   `packages/adapters/src/xai-voice.test.ts`
-   `packages/core/src/alma-unavailable.ts`

On the upstream `packages/adapters/src/executor.ts`, `packages/adapters/src/voice-factory.ts`, `packages/adapters/src/index.ts`, and `apps/api/src/voice.ts`, re-attach those modules the way ALMA `HEAD` calls them. The Models and Voice settings entries are removed on web and on the phone. Deep links to those screens return to Account. The server chooses the model and the voice. Members do not pick a provider. The Read replies aloud switch stays; it is the spoken-summary control, not a provider picker.

The web Call button and the existing mobile call waveform stay on upstream's composer. They use the xAI speak path when operator voice is on. Upstream's spoken-summary control (`readAloud` / `autoSpeak`, `apps/web/src/pages/shell/use-read-aloud.ts`) stays. Its playback call uses the voice factory. When `ALMA_VOICE_PROVIDER=xai`, that factory returns xAI, so summaries and Call share one speaker. Do not add a second speak button.

Web Hold to talk is visible when `PHONE_CALLS_ENABLED` is on, or `voice/status.transcribe` is true, or `me.managedVoice` is true. The phone composer has no Dictate / Dictar control.

### 4. Connectors

Account → Integrations, and the chat entry that opens the same screen, use upstream's Integrations UI on web and on mobile. Do not add an MCP Registry search, a Popular card grid, or an ALMA-only connectors page. `mcp.registry.search` is not a procedure. There is no client for `https://registry.modelcontextprotocol.io`.

`apps/api/src/routes/mcp.ts` matches upstream, including stdio refusal, duplicate-name conflict, and connect-from-approval-card. The only connector copy that stays rewritten is the comment in `apps/web/src/pages/McpServersOverlay.tsx` that names ALMA instead of Rakazo.

Official behavior, followed as written:

-   `docs/integrations.md`, “Connect from Integrations” and “Add your own tools”: Integrations is the connectors screen. **Browse MCP servers** searches a public directory.
-   `docs/self-host-integrations.md`, “Apps and connectors”: `INTEGRATIONS_CATALOG_URL` is an integrations.sh catalog. The server appends `api/search`. Upstream's Browse MCP screen calls `capabilities.catalogSearch` with `usePublicCatalog`, which uses `https://integrations.sh` when no catalog URL is set.

The marketing catalog stays the committed snapshot. It is not the in-app connection catalog. The in-app grid reads `connections.catalog` from the configured connector provider. Logos in `apps/www/public/integrations/catalog.json` stay on `https://alma.com.do`. `CATALOG_URL` still overrides that file. Do not point either catalog at a Rakazo host.

### 5. Legal

Surgical pages. Keep upstream's section structure. Set these sentences.

`apps/www/src/pages/terms.astro`, `apps/www/src/pages/privacy.astro`, and the legal block in `apps/www/src/agent-content.ts`:

> These terms are governed by the laws of the Dominican Republic. Disputes will be resolved in the courts of Santo Domingo, D.N., except where your local law gives you the right to bring a claim where you live.

The privacy page uses "This policy" instead of "These terms" in that sentence. Party name on those three surfaces: `ALMA INTELIGENCIA, S.R.L.` Copyright line: `© 2026 ALMA INTELIGENCIA, S.R.L.` Delete a street address if upstream prints one. Do not add a street.

Voice disclosure, added to the privacy page's voice bullet and to the provider-link list:

> When this server's operator voice is xAI, recorded audio and text chosen for speech are sent to xAI.

Link the name xAI to `https://x.ai/legal/privacy-policy`.

### 6. Mobile release

Restore from ALMA `HEAD` (absent on upstream):

-   `bitrise.yml`
-   `apps/mobile/fastlane/**`
-   `apps/mobile/Gemfile`
-   `apps/mobile/Gemfile.lock`
-   `apps/mobile/plugins/with-strip-foreground-services.js`
-   `apps/mobile/plugins/with-strip-foreground-services.test.js`
-   `apps/mobile/scripts/fix-android-namespace.mjs`
-   `apps/mobile/scripts/bump-native.mjs`
-   `apps/mobile/scripts/generate-mark.mjs`
-   `apps/mobile/node-module-shim.js`
-   `apps/mobile/lib/sentry-policy.ts`
-   `apps/mobile/lib/sentry-upload.cjs`
-   `apps/mobile/lib/store-release.test.ts`
-   `apps/mobile/lib/android-namespace.test.ts`
-   `apps/mobile/lib/node-module-shim.test.ts`

`apps/mobile/metro.config.js` and `apps/mobile/app.json` are surgical. On the upstream metro config, keep the `node:module` → `node-module-shim.js` alias. On the upstream `app.json`, set identity from section 1 and these version fields:

| Field                      | Value                                                                                                            |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `expo.version`             | `1.0.12`                                                                                                         |
| `expo.ios.buildNumber`     | `66` (above the published store build `64`)                                                                      |
| `expo.ios.supportsTablet`  | `true`, matching upstream. ALMA ships on iPad as well as iPhone. App Store iPad support cannot be removed later. |
| `expo.android.versionCode` | `14` (above the published store build `13`)                                                                      |

The native `apps/mobile/ios` project is not checked in. Prebuild reads `supportsTablet: true` and includes iPad in `UIDeviceFamily` and `TARGETED_DEVICE_FAMILY`.

`./plugins/with-strip-foreground-services` stays registered for 1.0.13. The rakazo-notifications module still declares the microphone and remote-messaging foreground services, but the app manifest removes them until Google Play's foreground-service declaration and demo video are done. Background calls on Android ship in a later release that unregisters the plugin.

Do not run a Bitrise workflow.

### 7. Draft review and organization settings stay out

Upstream does not have these screens. They are not part of the overlay.

Do not restore the draft-review pages, the organization-settings page, their routes, their RPC procedures, or the Prisma models `OrganizationProfile`, `OrganizationLawyer`, `OrganizationLogo`, `OrganizationSettingsAudit`, `ReviewDraft`, and `DraftApprovalLog`.

The message Report action is restored. See `docs/designs/2026-11-03-alma-batch.md`. `MessageReport` is in the schema again. Do not add a migration; `20261031120000_message_reports` already created the table.

The phone menu (sample data, a separate drafts list, a separate chat, a separate computer, approval history, firm, and about) stays absent. Sample-data mode stays absent.

The migrations that already created those tables stay in the tree, so a database that applied them can still run `migrate deploy`:

-   `packages/db/prisma/migrations/20261026120000_organization_settings/**`
-   `packages/db/prisma/migrations/20261026140000_draft_approval/**`
-   `packages/db/prisma/migrations/20261031120000_message_reports/**`

Do not add a migration that drops those tables or their rows. A later deploy can drop the organization and draft tables once nothing in production still reads them. Until then those two tables sit unused, with row-level security still on. `message_reports` is in use again.

### 8. Deploy

On upstream's compose files, add the env passthrough next to the existing `XAI_API_KEY` entry:

`ALMA_MANAGED_MODEL`, `ALMA_MODEL_RUNTIME`, `ALMA_MODEL_PROVIDER`, `ALMA_MODEL_ID`, `ALMA_MODEL_BASE_URL`, `ALMA_MODEL_API_KEY`, `ALMA_VOICE_PROVIDER`, `ALMA_GROK_SCRATCH`, `GROK_BIN`, `GROK_HOME`.

Files: `infra/compose/docker-compose.yml`, `infra/compose/docker-compose.prod.yml`, `infra/compose/docker-compose.images.yml`.

`SIGNUPS_ENABLED` stays wired the way upstream wires it. If upstream removed the key, put ALMA's wiring back.

`infra/compose/Dockerfile` is surgical. After the upstream image steps, keep `chmod 1777 /tmp` and the optional `INSTALL_GROK_CLI=1` block that installs the `grok` binary. The default build does not download it.

Do not change DNS, Cloudflare, or a live host.

### 9. Billing price

`BYOK_MONTHLY_PRICE_CENTS` in `packages/contracts/src/domain.ts` is `5900`. That is USD 59 per month.

The server reads `BYOK_MONTHLY_PRICE_CENTS` from the environment in `apps/api/src/billing.ts` before using the constant:

-   Unset: `5900`.
-   A positive integer: that many cents.
-   `0`: the own-key plan is free (`null`).

Own-key Checkout keeps using Stripe `price_data` and sets `unit_amount` to that resolved value only. It does not also send `1500`, and it does not add `STRIPE_PRICE_ID` on that checkout. `STRIPE_PRICE_ID` stays the legacy seat price.

Tests and e2e fixtures that assert this plan's amount follow the resolved value. A fixture that used `1000` cents or the text `$10 / month` for the own-key plan becomes `5900` and `$59 / month`. A test that expected upstream's `1500` for this plan expects `5900`.

`formatBillingAmount` in `apps/web/src/lib/billing.ts`, and the mobile own-key price string, format USD with locale `es-DO` when the UI locale is `es`. Node's `es-DO` currency format of 5900 cents with zero fraction digits is `US$59`. The Spanish catalog already says `{price} / mes`, so the line reads `US$59 / mes`. Mobile does not prefix a bare `$` onto this price.

This change does not create or edit a Stripe product, price, customer, or webhook. An existing subscription keeps the amount Stripe already stored. `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` turn billing on.

## What is dropped

Drop an ALMA screen edit that sections 1–6, 8, and 9 do not name. Those sections still apply, including the rebrand, the link removals, Hold to talk, the Call button, the connectors grid, the legal sentences, hidden model setup, and the $59 price. Section 7 names the draft-review and organization-settings surfaces, which stay out. The message Report action is part of the product again.

Upstream's settings layout, Messaging settings, lettered question options, and mobile Routines screen stay. Spoken-summary controls stay; section 3 only changes which factory they call when operator voice is xAI.

Do not keep a second copy of an upstream control.

ALMA's old version name `1.0.9` is not kept. The version name is `1.0.12`.

## Verification

These commands pass:

-   `pnpm lint`
-   `pnpm check`
-   `pnpm test`
-   `scripts/check-alma-overlay.sh`

Web e2e for sign-in, chat, the connectors grid, the Call button, and billing runs when the local harness starts. If the harness cannot start, the pull request says which screens were shot another way, and the unit checks above still pass. Desktop Electron e2e is not run locally.

Screenshots, as pull-request artifacts:

-   Sign-in, with the title `Sign in to ALMA` or `Inicia sesión en ALMA`.
-   A chat thread.
-   The connectors screen: search, category chips, the top row of Gmail, Google Calendar, Google Drive, Slack, and Notion, Recommended, and the per-category sections.
-   The Call button on the composer.
-   Billing or upgrade with the own-key line `US$59 / mes` at locale `es`.

## Out of scope

Do not merge the pull request. Do not deploy. Do not trigger Bitrise or a store upload. Do not commit secrets, signing keys, or certificates. Do not edit DNS, Cloudflare, a live Stripe account, App Store Connect, or Google Play.
