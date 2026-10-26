# Drift check: ALMA rebrand

*   **Document:** `docs/designs/alma-rebrand.md`
*   **Date:** 2026-10-26
*   **Tree:** the implementation commit on `cursor/alma-rebrand`

Compared the naming table, the logo file list, and the What stays table with the tree. No miss blocks the pull request. The notes below are the places the tree is more specific than the design, or where a sentence was adjusted so the design's own rules still hold.

## Naming

The slots in the naming table match the tree:

*   Icon label, PWA `name` and `short_name`, desktop `productName`, and the web `<title>` are `ALMA`.
*   The sign-in title is `Sign in to ALMA`. The Spanish catalog is `Inicia sesión en ALMA`.
*   The English one-line description is `ALMA AI prepares drafts for review.` on the web meta description, the PWA description, `SITE_DESCRIPTION`, the About opening, and the English README opening. The web manifest has that one English description.
*   Korean, Chinese, and Japanese home meta descriptions, and the Japanese and Chinese README openings, keep their sentences. The product token in those descriptive sentences is `ALMA AI`.
*   Email subjects use `ALMA` (`Verify your ALMA email`). The desktop microphone string is the sentence in the naming table.
*   The footer, terms, privacy, and About copyright lines use `© 2026 ALMA INTELIGENCIA, S.R.L.` The store copyright file is `2026 ALMA INTELIGENCIA, S.R.L.` with no © sign.
*   A longer sentence that tells the reader what the product is uses `ALMA AI` (`ALMA AI is in beta`, the About maintenance sentence, the locale descriptions above). A button, a window title, an email, a permission string, or an instruction that names the product (`Sign in to ALMA`, `Change ALMA Server…`, `starts ALMA`) keeps `ALMA`.
*   English `a Rakazo` became `an ALMA` so the article matches the vowel. Spanish and Portuguese `a ALMA` (`Volver a ALMA`, `Escriba a ALMA`, `Retorno a ALMA`) stay, because `a` is a preposition there.

There is no Spanish marketing page. The Spanish one-line sentence is not a second web manifest. Phone copy that already said ALMA was left as it was, including `ALMA prepara borradores para revisión` in the About and store text.

## Party name

The six files named in the design use `ALMA INTELIGENCIA, S.R.L.` The Delaware street lines are gone. `hello@rakazo.com` stays. After approval, the governing-law sentence on the terms page, the privacy page, and the agent legal text names the laws of the Dominican Republic and the courts of Santo Domingo, D.N.

Two extra maintainer sentences use the same party name, because they are the same fact as the About page: the comparison row in `apps/www/src/guide.ts`, and the paragraph in `apps/www/src/pages/openclaw-alternative.astro`. `apps/www/src/agent-content.ts` is the sixth file the design already named.

Terms used to say notices go to "the address below" and then printed the street. The street is gone, so that sentence now says "the contact below" and the contact is `hello@rakazo.com`. No street and no new mailbox were added.

## Logo

`brand/alma-logo.svg`, `brand/alma-logo-white.svg`, and `brand/alma-icon.svg` are the fetched header SVG and favicon spark, with the viewBox values in the design. The raster list in the design was written by `pnpm --filter @rakazo/ui-tokens export:brand`. `apps/www/public/brand/rakazo-mark.png` is deleted. Splash backgrounds in `apps/mobile/app.json` are `#002D62`.

`packages/ui-tokens/assets/Rakazo.icon` is still that directory name. `Assets/orange-bot.png` is the white spark on transparent. The bundle was not recompiled.

`docs/readme-hero.png` is a committed screenshot. The sidebar word was `Rakazo` and the sidebar mark was the old orange bot. Those two pixels were replaced with `ALMA` and the navy spark. The rest of the screenshot is unchanged. Article Open Graph cards were re-rendered with the ALMA mark; Chrome was available, so that check is not a miss.

## What stays

`alma://` was not added. `trustedOrigins` still lists `rakazo://` only. The phone `scheme` array is still `alma` and `rakazo`.

Unchecked rows from the What stays table are unchanged: `@rakazo/*`, database and Postgres user names, `RAKAZO_` and `__RAKAZO_`, `elie222/rakazo`, `rakazo.com` and the two mailboxes, store URLs including `rakazo.apk`, `dev.rakazo.desktop`, `extraMetadata.name` `rakazo`, Linux `executableName` `rakazo`, native module paths and class names, `Rakazo.icon`, `RakazoDesktop` and `window.rakazoDesktop`, the `LICENSE` line, existing `CHANGELOG.md` lines, the two credits sentences, and `docs/designs/**`.

`rg` still matches other lowercase and code tokens (Docker image names, headers, storage keys, the sandbox user, test fixtures, the repo directory in `cd rakazo`). Those are the catch-all row. A capitalized `Rakazo` outside the credits sentences, `Rakazo.icon`, `LICENSE`, `CHANGELOG.md`, and `docs/designs/**` does not remain.

The Linux AppImage example in the README follows `productName`, so it is `ALMA-*.AppImage`. The published GitHub path stays `elie222/rakazo`.

A case-variant host in the passkey test (`App.Rakazo.com`) and the Windows sandbox path fixture (`C:\Users\Owner\Rakazo`) stay. They are the same internal names as `app.rakazo.com` and the sandbox directory, not the product label.
