# ALMA rebrand

*   **Author:** WEB-DO-Cloud/alma
*   **Status:** In Review
*   **Date:** 2026-10-26

The marketing site in this repository is `apps/www`, served at `rakazo.com`. `https://www.alma.com.do` is only the logo source. Copy edits do not change that site.

PWA means the installable web app. Lingui is the web app's translation tool. Icon Composer is Apple's editor for the `Rakazo.icon` bundle. Bitrise is the existing mobile CI app. Damien is the product owner who must approve the pull request before merge.

## Problem

People still read the previous product name on the web app, the desktop app, `apps/www`, email, notifications, page titles, and the docs. The phone icon label and the store listing already say ALMA. Installed copies still depend on the package scope, the `rakazo://` origin, and the database name.

## Naming rules

Use this table. A later section does not override it.

| Slot | Exact text |
| --- | --- |
| Icon label, PWA `name`, PWA `short_name`, desktop `productName`, a `<title>` or window title whose whole text is the product name | `ALMA` |
| Sign-in title | `Sign in to ALMA`. Spanish catalog: `Inicia sesión en ALMA`. |
| Other buttons and short titles | Keep the sentence. The product token becomes `ALMA`. |
| Web and marketing meta description, PWA `description`, `og:description`, the opening sentence of About, the opening sentence of the README | English: `ALMA AI prepares drafts for review.` Spanish page: `ALMA AI prepara borradores para revisión.` The web manifest has one description field. That field is the English sentence. |
| A longer sentence that describes the product | Keep the other words. The product token becomes `ALMA AI`. |
| `og:title` and `twitter:title` | `ALMA` when the title is only the product name. Otherwise the same rule as buttons. |
| Email subject and the visible From name | Product token becomes `ALMA`. Example subject: `Verify your ALMA email`. |
| Push title already fixed on the phone | Stays `ALMA`. |
| Copyright line on the marketing footer, the terms page, the privacy page, and the phone store copyright file | `© 2026 ALMA INTELIGENCIA, S.R.L.` The store file `apps/mobile/fastlane/metadata/copyright.txt` has no © sign. Its text becomes `2026 ALMA INTELIGENCIA, S.R.L.` |
| Store listing title | `ALMA Asistente IA`. That field is separate from the on-device label `ALMA`. |
| OS permission strings | Product token becomes `ALMA`. Desktop key `build.mac.extendInfo.NSMicrophoneUsageDescription` in `apps/desktop/package.json` becomes `ALMA uses the microphone for dictation and voice calls with your bots.` |

On a Spanish screen that already exists, keep the Spanish words and change only the product token.

Do not claim the product is an `AI lawyer` or `abogado IA`, that it `replaces attorneys` or `sustituye a un abogado`, or that it gives legal advice. A sentence that denies those claims stays. If an edited sentence makes one of those claims, replace that sentence with the one-line description in the page's language.

Keep this store sentence unchanged: `A named lawyer at the firm reviews each draft, sees the changes, and approves it before it leaves. ALMA does not replace the professional judgment of the person who reviews.`

Party name on these files only: `apps/www/src/components/Footer.astro`, `apps/www/src/pages/privacy.astro`, `apps/www/src/pages/terms.astro`, `apps/www/src/pages/about.astro`, `apps/www/src/structured-data.ts`, and the party sentences in `apps/www/src/agent-content.ts`. Replace `Inbox Zero Inc.` with `ALMA INTELIGENCIA, S.R.L.` Remove the lines `131 Continental Dr, Suite 305` and `Newark, Delaware 19713, United States`. Do not add a street. Leave this paragraph byte for byte:

> These terms are governed by the laws of the State of Delaware, without regard to its conflict of law rules. Disputes will be resolved in the state or federal courts located in Delaware, except where your local law gives you the right to bring a claim where you live. To the extent permitted by law, you and we each waive any right to a jury trial.

`hello@rakazo.com` and `security@rakazo.com` stay.

The only allowed visible credits sentences that still contain the old name are the ones already in `apps/mobile/lib/alma-copy.ts`:

*   Spanish: `ALMA incluye software de Rakazo, publicado bajo la licencia Apache-2.0. Copyright de los autores de Rakazo.`
*   English: `ALMA includes Rakazo software, published under the Apache-2.0 license. Copyright the Rakazo authors.`

Delete both placeholder lines: `El ícono de la tienda es un marcador. La pieza final está pendiente.` and `The store icon is a placeholder. Final art is pending.`

`#002D62` is the mark plate only (icon, splash background, social card). The rest of the app keeps its current colors. In-app bot colors stay as they are.

## Goals

*   Apply the naming table to visible product names in the web app, `apps/www`, the desktop shell, phone strings that still use the old name, auth email, notification text, and user-facing docs.
*   Ship the logo files and the raster exports in the Logo section.
*   Leave every What stays row unchanged, including strings a person can see (mailboxes, `rakazo.com`, store URLs, the credits sentences, the `LICENSE` line).
*   `rg -i rakazo` from the repository root matches only a What stays row.

## Non-goals

*   Do not rename any What stays row. That includes the npm scope, `rakazo://`, the database and Postgres user, `RAKAZO_*`, the GitHub path, native module paths and class names, and the desktop bundle id.
*   Do not add `alma://` to API `trustedOrigins`. Do not add a new `alma://` link. The phone `scheme` array already lists `alma` and `rakazo`. The client keeps sending `rakazo://`.
*   Do not edit `LICENSE`. Do not add a `NOTICE` file. There is no `NOTICE` file today.
*   Do not edit existing lines in `/CHANGELOG.md`. This change adds no changelog entry.
*   Do not edit `docs/designs/**` while replacing the product name. Those files name the old product on purpose.
*   Do not change JSON keys, error codes, storage keys, cookie names, user-agent tokens, Docker image names, or any string a client compares. Display copy still changes when it shares a file with those identifiers.
*   Do not recompile the Icon Composer bundle. This change has no macOS Xcode 26 machine.
*   Do not pick a new governing law.

## Logo

Fetched on 2026-10-26:

*   Header SVG `https://www.alma.com.do/wp-content/uploads/2025/06/alma-logo.svg`, sha256 `07604186280eb4e0bb91adc259f79b52e228d059fc6dd1dc656ab4b954355890`. Fill `#002D62`. Spark plus the word ALMA. No `script`, no `foreignObject`.
*   Favicon SVG `https://www.alma.com.do/wp-content/uploads/2025/06/favicon.svg`, sha256 `efa9272a46cf88c05b9ae8b2023c80879859d870145dfa23498275f2f0d0a5dd`. The same spark, fill `#002D62`, no word.

`logo4.svg` on that site is a different wordmark, fill `#64748B`. Its SVG group id is `Homey`. The site's social-preview image points at that file. This change does not use it.

The three files live in `brand/` because that is the path this change publishes:

*   `brand/alma-logo.svg` — the header SVG plus `viewBox="0 0 259 67"`.
*   `brand/alma-logo-white.svg` — the same paths, fill `#FFFFFF` only.
*   `brand/alma-icon.svg` — square `viewBox="0 0 1024 1024"`, background rect `#002D62`, white spark centered. The spark's bounding box is 676 by 676 user units (66 percent of 1024), centered. The wordmark is 259 by 67 user units and is not placed in this square.

`packages/ui-tokens/scripts/export-brand.ts` reads `brand/alma-icon.svg` for icon outputs and `brand/alma-logo-white.svg` for the splash image and `og-image.png`. Run `pnpm --filter @rakazo/ui-tokens export:brand`.

| Output | Canvas |
| --- | --- |
| `apps/mobile/assets/icon.png` | 1024, white spark on `#002D62` |
| `apps/mobile/assets/adaptive-icon.png` | 1024, white spark, no background rect |
| `apps/mobile/assets/icon-background.png` | 1024, flat `#002D62` |
| `apps/mobile/assets/monochrome-icon.png` | 1024, white spark on transparent |
| `apps/mobile/assets/notification-icon.png` | 72 by 72, white spark on transparent. The app config uses this single file. |
| `apps/mobile/assets/splash-icon.png` | 1024 square, transparent, white wordmark 720 user units wide, centered |
| `apps/mobile/assets/favicon.png` | 128, white spark on `#002D62` |
| `apps/web/public/favicon.svg` and `apps/www/public/favicon.svg` | the navy spark on transparent, copied from the favicon SVG |
| `favicon.ico` | 16, 32, and 48, white spark on `#002D62` |
| `favicon-16x16.png`, `favicon-32x32.png`, `favicon.png` | 16, 32, and 32, same plate. `favicon.png` is 32. |
| `apple-touch-icon.png` | 180, same plate |
| `icon-192.png`, `icon-512.png` | 192 and 512, same plate |
| `apps/www/public/brand/alma-mark.png` | 256, same plate. `apps/www/src/components/Logo.astro` loads this file. The word next to it is `ALMA`. Then delete `apps/www/public/brand/rakazo-mark.png`. |
| `apps/desktop/assets/icon.png` | 1024, same plate. Electron Builder `build.linux.icon` uses this file if that key exists; otherwise the script still writes the file. |
| `apps/desktop/assets/icon.ico` | 16, 32, 48, 64, 128, 256 |
| `apps/desktop/assets/icon-macos.png` | 1024, same plate, for development |
| `apps/www/public/og-image.png` | 1200 by 630, `#002D62`, white wordmark 720 wide, centered |

`apps/mobile/app.json` splash `backgroundColor` and `dark.backgroundColor` change from `#141414` to `#002D62`.

Inside `packages/ui-tokens/assets/Rakazo.icon/Assets/orange-bot.png`, replace the pixels with the 1024 white spark on transparent. Leave `icon.json` and the directory name. Electron Builder `build.mac.icon` stays `../../packages/ui-tokens/assets/Rakazo.icon`. That bundle is not recompiled here. Linux and Windows icons are the PNGs and the ICO from `export-brand.ts`.

Do not change the PWA manifest `id` (`/` in `apps/web/src/pwa/plugin.ts`).

## What stays

`rg -i rakazo` may still match these rows. The credits sentences, the `LICENSE` line, existing `/CHANGELOG.md` lines, and `docs/designs/**` stay as visible text. The other rows are internal names. A follow-up in this table is not part of this change. Rows marked None have no follow-up.

| Identifier | Why it stays | Follow-up |
| --- | --- | --- |
| `@rakazo/*` | Renaming republishes every package. | Codemod after a published alias exists. |
| `rakazo://` | API `trustedOrigins` lists this origin only. | Accept `alma://` and `rakazo://` together, with a test, then prefer `alma://`. |
| Database `rakazo`, role `rakazo_app`, Postgres user default `rakazo` | Renaming the database leaves the existing data volume unused. | New name for new installs only. |
| `RAKAZO_` and `__RAKAZO_` | Deployed env files and the service worker inject these names. | Accept `ALMA_` as an alias later. |
| `elie222/rakazo` | Rewriting it makes the install script request a URL that is not there. | When the repository is renamed. |
| `rakazo.com`, `hello@rakazo.com`, `security@rakazo.com` | The host and the mailboxes are live. `alma.com.do` is a different site. | When DNS and mail move, point the docs at the host and mailbox that move names. |
| `/app/rakazo/` and `rakazo.apk` | Those URLs are the published binaries. Visible labels still change in this change. | When the store record and the asset are renamed. |
| `dev.rakazo.desktop` and `extraMetadata.name` `rakazo` | Passkeys and the updater bind the bundle id. The executable name is the metadata name. In this change, `productName` becomes `ALMA`. | A new bundle id needs a new signing identity. |
| `modules/rakazo-*`, `com.rakazo.*`, `RakazoFileDropModule`, `RakazoFoldRegionsModule`, `RakazoNetworkCacheModule`, `RakazoNotificationsModule`, `RakazoNotificationService`, `RakazoCallService` | Expo and the OS bind these names. They are not the name under the icon. The phone bundle id is already `do.alma.app`. | Rename with a device install. |
| Linux user `rakazo` in the desktop sandbox image | Home directory ownership uses it. | Rename with a new image. |
| Directory `Rakazo.icon` | Electron Builder points at it. | Rename with the desktop bundle id. |
| `RakazoDesktop`, `window.rakazoDesktop` | The preload and the web client share them. | Rename both sides with the preload test. |
| Any other token that contains `rakazo` and is not the capitalized product name in visible copy: function names, file names, CSS classes, comments that name an identifier, test fixtures, Docker image names, cookie names, storage keys, user-agent strings | Changing them breaks builds or clients. Display copy in the same file still changes. | None. |
| `LICENSE` line `Copyright 2026 Rakazo contributors` | Apache-2.0 attribution. | None. |
| Existing lines in `/CHANGELOG.md` | History. A new entry is not added. | None. |
| The two credits sentences quoted above | The license asks for the attribution. | None. |
| `docs/designs/**` | The spec and the review name the old product so the rule can be checked. | None. |

Phone `bundleIdentifier` and Android `package` are already `do.alma.app`. Expo `slug` is already `alma`. This change does not edit them.

## Alternatives

*   **Rename the scope, the scheme, and the database together.** Rejected. Installed copies would break, and this change has no migration.
*   **Accept `alma://` in this change.** Rejected. No dual-origin test is in scope. The client keeps sending `rakazo://`.
*   **Draw a new mark, or place the wordmark in the app icon.** Rejected. The site already publishes the spark as the favicon. The wordmark box is 259 by 67 user units.
*   **Leave `apps/www` named with the old product until a separate text edit.** Rejected. On every marketing page, including every article, keep the facts and change only the product token.
*   **Leave the terms and privacy party name unchanged until counsel writes a full novation.** Rejected for this change. The request requires the party name `ALMA INTELIGENCIA, S.R.L.` on the copyright line, the terms page, the privacy page, and the contact footer. The governing-law paragraph stays. Damien approves that split before merge.
*   **Invent a street address or a new mailbox.** Rejected. Those facts were not provided.
*   **Append "This is not legal advice" to every description.** Rejected. The one-line description is the new short copy. Existing denial sentences stay. The interface does not gain a second disclaimer on every screen.

## Risks

*   **A visible `Rakazo` string is missed.** Run `rg -i rakazo` from the repository root. Place each hit in a What stays row. Any other hit fails.
*   **Lingui catalogs drift.** Change the English source. Run `pnpm --filter @rakazo/web intl:extract`, set each locale's translation of those strings (Spanish uses the Spanish sentence for the one-line description; other locales keep their sentence and change the product token to `ALMA` or `ALMA AI` per the table), then run `pnpm --filter @rakazo/web intl:compile`. Do the same token change in `apps/web/scripts/translations-*.json`. No command in the repo reads those JSON files today. They are updated so a later import cannot restore the old token.
*   **The terms name `ALMA INTELIGENCIA, S.R.L.` and keep Delaware law.** `S.R.L.` is the Dominican company form used by the requested legal name. This change does not choose a new jurisdiction. Merge waits for Damien's approval of that split.
*   **The macOS `.icon` bundle is not recompiled.** Recompiling it needs Xcode 26 on macOS. The foreground PNG is replaced so a later compile does not keep the orange art. Linux, Windows, web, and phone icons come from `export-brand.ts`.
*   **Article social cards are rasters.** Run `node apps/www/scripts/render-og.mjs` when `CHROME_PATH` or the script's default Chrome exists. If it does not, list the card paths in `docs/designs/reviews/2026-10-26-alma-rebrand-drift.md` and treat the missed render as a failed check to record, not as a pass.
*   **The installed desktop app's display name becomes ALMA on each platform.** The bundle id stays `dev.rakazo.desktop`, so an update still matches that id. The PWA `id` stays `/`.

## Implementation plan

1. Write the three SVGs in `brand/` from the fetched files. Recorded hashes above. Add the `viewBox` values in the Logo section. Do not redraw paths.
2. Point `export-brand.ts` at the icon SVG and the white wordmark as specified. Run `pnpm --filter @rakazo/ui-tokens export:brand`. Replace `orange-bot.png` pixels. Repoint `Logo.astro`, then delete `rakazo-mark.png`. `pnpm --filter @rakazo/ui-tokens check` must pass before the next step.
3. In `apps/mobile/app.json`, set both splash background keys to `#002D62`. In `apps/desktop/package.json`, set `productName` and the author name to `ALMA`, set the microphone string quoted above, and leave `build.appId` and `extraMetadata.name`.
4. From the repo root, replace the capitalized product token in visible copy using the naming table. Roots: `apps/web`, `apps/www`, `apps/desktop`, `apps/mobile`, `packages/auth/src/email.tsx`, `apps/api` display strings, other `packages/**` display strings, `README.md`, `README.ja.md`, `README.zh-CN.md`, and `docs/` except `docs/designs/**`. Skip a match that is a What stays row. Do not rename a lowercase code identifier.
5. Apply the party-name edits to the six files listed under Naming rules.
6. Delete the two placeholder sentences in `apps/mobile/lib/alma-copy.ts`.
7. Run the Lingui commands in Risks. `pnpm --filter @rakazo/web intl:compile` must pass before tests.
8. Update tests that assert the old visible product name. Leave tests that assert `@rakazo`, `rakazo://`, or `RAKAZO_`.

## Verification

*   `rg -i rakazo` from the repository root. Group the hits by What stays row and record the counts in the pull request. A hit outside those rows fails.
*   `pnpm --filter @rakazo/ui-tokens check`
*   `pnpm --filter @rakazo/web check` and `pnpm --filter @rakazo/web test`
*   `pnpm --filter @rakazo/desktop check` and `pnpm --filter @rakazo/desktop test`
*   `pnpm --filter @rakazo/www check` and `pnpm --filter @rakazo/www build`
*   `pnpm --filter @rakazo/auth test`
*   `pnpm --filter @rakazo/api test` if API display strings change
*   `pnpm --filter @rakazo/mobile test`
*   The pull request runs the existing Bitrise `mobile-tests` workflow. Do not add a Bitrise config. The gate is that workflow finishing green.
*   Screenshots of `brand/alma-icon.svg`, the splash PNG, and the web sign-in screen whose title reads `Sign in to ALMA`.

## Drift check

After implementation, compare the naming table, the logo file list, and the What stays table with the tree. Write misses to `docs/designs/reviews/2026-10-26-alma-rebrand-drift.md`. A miss blocks calling the work done.
