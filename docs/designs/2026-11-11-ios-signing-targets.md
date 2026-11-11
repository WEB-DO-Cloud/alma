# iOS signing targets for 1.0.16

*   **Status:** Owner approved getting 1.0.16 built and submitted. This change does not bump the version, run match, trigger a build, or submit.
*   **Date:** 2026-11-11
*   **Build:** Bitrise iOS archive 275. Base `a3b18d785ccb8090f152879cdcafde20bd293809`.

## Problem

Archive fails for two independent reasons.

1. Expo prebuild writes the upstream app group `group.com.rakazo.app` into the main app and the share extension. The active App Store profile for `do.alma.app` allows `group.do.alma.app`, so the main app's provisioning does not support the entitlement prebuild emits.
2. `use_match_signing!` applies `APPLE_TEAM_ID` and a match profile to the `ALMA` and `RakazoWidgets` targets only. `expo-sharing-extension` and `AgentNotifications` stay on automatic signing with no development team. `match` is asked only for `do.alma.app` and `do.alma.app.widgets`, so it does not install profiles for the other two signed targets.

## Decision

Shared storage uses `group.do.alma.app` everywhere a producer or consumer names it.

*   The producer is the share extension. `expo-sharing`'s `ios.appGroupId` is the input. That plugin writes the group into the extension entitlements file, the extension's group id, the main app's `com.apple.security.application-groups` entitlement, and the main app's `ExpoShareIntoAppGroupId` Info.plist entry.
*   The same value is set on the share extension entry in `extra.eas.build.experimental.ios.appExtensions`, and on `ios.entitlements`, so the committed config and the plugin input cannot disagree. `expo-sharing` adds a group that is already present; it does not replace a different one. Both sites change together.
*   The consumer in JavaScript is `IOS_SHARE_APP_GROUP` in `apps/mobile/lib/incoming-share.ts`. It must equal `appGroupId`. The native share module reads the Info.plist entry, not this constant.

Extension bundle ids stay:

*   `do.alma.app.expo-sharing-extension` (target `expo-sharing-extension`)
*   `do.alma.app.notifications` (target `AgentNotifications`)
*   `do.alma.app.widgets` (target `RakazoWidgets`)

The share plugin's `ios.extensionBundleIdentifier` is set to that first id. Prebuild must not depend on the package default, which happens to be the same string today.

Signing uses the team already configured as `APPLE_TEAM_ID`. No team id, profile name, certificate, or password is written into the repo.

*   One list in the Fastfile, `SIGNED_TARGETS`, names the app target `ALMA` plus the three extension targets and their bundle ids. For `type: appstore`, `sync_certificates` passes those four bundle ids to `match`. Development sync stays the app and the widget, which is what that lane already requested. Archive does not call the development sync. Asking `match` for development profiles for the share and notification extensions is not required to archive, and a create run would register new portal profiles.
*   `use_match_signing!` is the only place a team is written onto a target. For each of the four, it sets manual signing, `APPLE_TEAM_ID`, the `Apple Distribution` identity, and that target's App Store profile in the same call. It refuses to continue if `match` did not export a profile name for any id. The app target still follows `ALMA_IOS_SCHEME` when that env is set; the other three names are the Xcode target names. The returned map is every bundle id to its profile name, and the archive lane already gives that map to gym.
*   Prebuild does not set `DEVELOPMENT_TEAM`. A team on an automatic target lets Xcode register a profile. The uploaded-signing branch skips `use_match_signing!` and is unchanged: it does not gain a team without a profile.
*   `Matchfile`'s `app_identifier` lists the same four bundle ids. Match loads that file with `eval`, so it does not `require` the Fastfile. A test asserts the two lists are the same set. The archive lane passes the list on the `match` call, which overrides the Matchfile.

Entitlements that are not shared storage stay as they are.

*   Widgets have no app-group entitlement. The widget App ID's only extra capability is In-App Purchase. Do not add one.
*   The notification service does not read or write the shared container. Its entitlements stay `com.apple.developer.usernotifications.communication` only. The notification App ID already has the app-group capability, and its App Store profile already contains `group.do.alma.app`. A binary entitlement must be a subset of the profile. Omitting the group is valid. Adding it would claim storage the extension does not use.

`apps/mobile/ios` stays gitignored. This change does not commit a generated Xcode project.

## Apple portal

No new bundle id, app group, or capability. All four bundle ids already exist. The active App Store profiles for `do.alma.app`, `do.alma.app.expo-sharing-extension`, and `do.alma.app.notifications` already contain `group.do.alma.app`. After this change the entitlements prebuild writes are inside those profiles, so the profiles do not need to be regenerated.

Do not run `match nuke`. Do not delete signing identities or certificates. This pull request does not run `match`.

Readonly `match` installs profiles that are already in the private certificates repo. It does not download an arbitrary portal profile, and it does not create one. The archive lane has been requesting profiles for the app and the widget only. If that repo does not already hold App Store profiles for the share and notification bundle ids, the next readonly `match` fails closed. The gap is filled by importing those existing portal profiles into the certificates repo. `ALMA_MATCH_CREATE=true` is the wrong recovery: a create run registers new match profiles on the portal. The existing flag stays in the Fastfile for the earlier one-time certificate setup. This change does not turn it on.

The uploaded-signing branch (`BITRISE_USE_UPLOADED_SIGNING=true`) still skips `match` and `use_match_signing!`. Profiles on that branch come from the Bitrise installer. This change does not set `DEVELOPMENT_TEAM` there. Build 275's errors are a profile that rejects `group.com.rakazo.app` and two extension targets with no team, which is the `match` path: `use_match_signing!` already runs, and it only covers the app and the widget.

## Tests

*   `app.json`, the Fastfile list, and the Matchfile name the same four bundle ids. The three extension target names match. `group.com.rakazo.app` is absent from those files and from `incoming-share.ts`.
*   `IOS_SHARE_APP_GROUP` equals the `appGroupId` in `app.json`.
*   Running `expo-sharing`'s `withConfig` with that `appGroupId` leaves exactly `["group.do.alma.app"]` on the main app and on the share extension. It does not keep the upstream group beside it.
*   The Fastfile sets `use_automatic_signing: false`, `team_id`, and `profile_name` inside the loop over `SIGNED_TARGETS`, and the lane still passes that loop's map to gym. No plugin writes `DEVELOPMENT_TEAM`.

## Not in this change

No version bump, no Bitrise or store build, no submit, no change to a Rakazo-branded bundle id upstream would ship. Upstream files that stay identical are not added to the overlay. `incoming-share.ts` and its test are overlay paths because this change is what makes them differ.
