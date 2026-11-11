# Review: iOS signing targets

-   **Document:** `docs/designs/2026-11-11-ios-signing-targets.md`
-   **Date:** 2026-11-11
-   **Method:** Two fresh sessions. Each was told to read only that design. Neither received the application source.

Both sessions returned fail. The resolutions below were applied to the design before implementation. A second pass was not run.

## Resolutions applied

-   **Readonly match, no create.** Archive `match` stays readonly and is asked for all four App Store bundle ids. If the certificates repo lacks the share or notification profile, the next archive fails closed. The recovery is importing the existing portal profile. `ALMA_MATCH_CREATE=true` stays in the Fastfile for the earlier one-time certificate setup and is not the way to fill this gap: a create run registers a new match profile. No nuke, no deleted identities.
-   **Team only with manual signing and a profile.** Prebuild does not set `DEVELOPMENT_TEAM`. `use_match_signing!` sets the team, manual signing, and that target's App Store profile in one call, for all four targets, and stops if any profile name is missing. The uploaded-signing branch still skips that call, so it does not gain a team without a profile.
-   **Development sync stays the app and the widget.** Archive does not request development profiles for the share and notification extensions. A create run on that lane would register portal profiles this change does not need.

## Contested

-   **Make the uploaded-signing branch install four profiles and set manual signing.** Build 275 is the match path: the main profile rejects `group.com.rakazo.app`, and `use_match_signing!` never reaches the share and notification targets. The installer branch stays as it is.
