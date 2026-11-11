# Goldfish review: upstream sync

-   **Document:** `docs/designs/alma-upstream-sync-2026-11.md`
-   **Date:** 2026-11-02
-   **Method:** Four fresh sessions. Each session was told to read only the design note. Reviewers did not receive the application source.

Passes asked: implementation readiness, product scope, adversarial, comprehension. All four returned fail. The resolutions below were applied to the document before implementation. A second swarm was not run.

## Resolutions applied to the document

-   **One path rule.** A path may differ from `upstream/main` only when `scripts/alma-overlay-manifest.txt` lists it, or it matches a named glob (catalogs, lockfile, this note, the review, the sync scripts). The old sentence "a path not named in this document" is gone.
-   **`whole` is restore, and only when upstream did not change the path.** A path that exists on both sides is surgical. The document no longer says the draft pages are whole-file overlays of the shell.
-   **Merge commands.** `git merge --no-commit`, then `git read-tree --reset -u MERGE_HEAD`. No `reset`, no checkout of the branch, no `merge --abort`. The commit is checked for two parents. `git add -A` is required so new files are not left untracked.
-   **Named restore lists** for the Grok and xAI modules, the MCP registry files, the mobile release files, and the draft and organization modules, plus the three migration directories.
-   **Four deletions** are named: the APK download route, the Rakazo mark, `RepoCard.astro`, and `github.ts`.
-   **Store URLs** are the App Store id `6829162072`, Play id `do.alma.app`, and `https://app.alma.com.do`.
-   **Voice switch.** `ALMA_VOICE_PROVIDER` unset is off. Only `xai` enables it. Managed model does not override it. Spoken summaries keep upstream's control; playback uses the factory, which returns xAI only when operator voice is on.
-   **Billing.** `price_data.unit_amount` is the resolved price (env, else `5900`, and `0` means free). It is not upstream's `1500` added beside `5900`. Tests that expect `1500` or `$10 / month` for this plan move to `5900`.
-   **Spanish money.** Locale `es` formats USD with `es-DO`, which is `US$59`. The catalog `{price} / mes` then reads `US$59 / mes`.
-   **Versions.** The check requires `1.0.12`, build `64`, and `versionCode` `13`, compared as numbers.
-   **Legal sentences are quoted.** Dominican Republic, Santo Domingo, D.N. Party name and copyright are quoted. The xAI voice sentence is quoted, with the privacy-policy URL. A street address on the upstream page is deleted.
-   **Drop list.** "Drop an ALMA screen edit that sections 1–9 do not name" replaces the shorter exception list that omitted legal copy, Hold to talk, and the draft pages.
-   **`expo.name` is `ALMA`. `expo.slug` is `alma`.** The store title is `ALMA Asistente IA`.
-   **Rakazo allowlist** includes the database name, native class names, `Rakazo.icon`, `LICENSE`, and `docs/designs/**`, and the check points at that list.
-   **Dictate check** reads the phone composer and root layout, not every string in the repo.

## Contested

-   **Keep web draft review and organization settings.** They are not in the short "UI should be upstream" list. They have migrations already shipped, and the restore-ui note kept the web pages. The phone menu that duplicated them stays deleted. The pull request says this so it can be rejected at merge.
-   **Do not force Spanish as the unsaved locale.** `es` is listed first. The fallback when nothing is saved and the device has no language stays English.
-   **No new Stripe Price id.** Upstream creates the own-key price inline. The operator sets `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. `STRIPE_PRICE_ID` remains the legacy seat price. This change does not create a live price.
