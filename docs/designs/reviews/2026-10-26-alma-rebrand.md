# Goldfish review: ALMA rebrand

*   **Document:** `docs/designs/alma-rebrand.md`
*   **Date:** 2026-10-26
*   **Method:** [Elephant-Goldfish Model](https://github.com/google/elephant-goldfish-model). Six fresh sessions. Each session was told to read only `docs/designs/alma-rebrand.md`, one persona, and the matching standard. Reviewers did not receive the application source.

Passes: zoom out, comprehension, design critic, structural, style, implementation readiness. All six returned fail on the first draft. The resolutions below were applied to the document before implementation. A second swarm was not run. The model caps a stage at one re-audit, and the request says to implement after the review.

## Resolutions applied to the document

*   **One done rule.** Goals now point at the naming table and the What stays table. Visible leftovers (mailboxes, host, store URLs, credits, `LICENSE`, changelog, `docs/designs/**`) are inside What stays, not a third list.
*   **One string per slot.** Icon label, titles, the sign-in title, the one-line description, longer sentences, email subjects, and permission strings each have an exact value. The single web manifest description is the English sentence. Spanish pages use the Spanish sentence.
*   **Display copy versus identifiers.** The plan replaces the capitalized product token in visible copy. Lowercase code identifiers stay. JSON keys, error codes, and strings a client compares stay even when they share a file with display copy.
*   **Legal pages have a file list.** Party name changes on the six named files. The Delaware street lines are quoted for deletion. The governing-law paragraph is quoted and kept byte for byte. No street and no mailbox are invented.
*   **Credits and the placeholder icon line are quoted.** The two existing About sentences stay. Both placeholder sentences are quoted and deleted.
*   **Logo geometry.** Hashes and fetch date for the two source SVGs. `favicon.svg` is the navy spark on transparent. PNG icons are the white spark on `#002D62`. The spark box is 676 of 1024. Splash and `og-image` use the white wordmark at a stated width. `#002D62` is the mark plate only.
*   **Mac icon.** The bundle is not recompiled. The foreground PNG is replaced. Linux and Windows icons come from `export-brand.ts`.
*   **`alma://`.** This change adds no `alma://` link and does not edit `trustedOrigins`.
*   **Marketing site defined.** `apps/www` served at `rakazo.com`. `alma.com.do` is the logo source only.
*   **Checks named.** Package scripts are listed. The `rg` check is a grouping against What stays, recorded in the pull request. Bitrise `mobile-tests` is the existing workflow. Drift notes have a file path.
*   **Microphone string quoted.** The desktop key and the full sentence are in the naming table.
*   **Docs designs excluded from the token replace.**

## Contested

*   **Leave the terms and privacy party name unchanged until a full novation.** The request requires `ALMA INTELIGENCIA, S.R.L.` on the copyright line, the terms page, the privacy page, and the contact footer. The governing-law paragraph stays. The pull request says it needs Damien's approval before merge. The party-name edit is not removed.
*   **Add "This is not legal advice" to every description.** The one-line description is `ALMA AI prepares drafts for review.` Existing denial sentences stay. A second disclaimer is not added to every screen.
*   **Move the SVGs out of `brand/`.** The request names `brand/alma-logo.svg`, `brand/alma-logo-white.svg`, and `brand/alma-icon.svg`.
*   **Leave `Rakazo.icon` byte for byte.** The user-visible desktop and phone icons are the raster exports. The orange foreground file inside the bundle is still replaced so a later Mac compile does not keep it. The bundle is not recompiled here.
*   **Accept `alma://` in this change.** The request says to propose that and not do it.

## Accepted without a code change

*   **No new Bitrise config.** The existing `mobile-tests` workflow is the check.
*   **No `NOTICE` file is added.**
*   **No changelog entry is added.**
*   **In-app bot colors stay.**
*   **PWA manifest `id` stays `/`.**
