# ALMA batch, 2026-11-03

Build on `cursor/restore-integrations-ui-dd22` (`f8800cdb`). One pull request whose base is that branch. Do not merge, deploy, or start a store build. Do not bump `expo.version`, iOS `buildNumber`, or Android `versionCode`. Do not print secrets.

The overlay rules in `docs/designs/alma-upstream-sync-2026-11.md` still apply: rebrand, no Rakazo links, Grok Build and Grok Voice only, no Models or Voice settings, $69 billing, default server `https://app.alma.com.do`.

## 1. Upstream sync

Merge `upstream/main` at `ade7100b` (68 commits after `e28f4d4e`).

```
git merge --no-commit upstream/main || true
git read-tree --reset -u MERGE_HEAD
```

Do not `git reset`, `git merge --abort`, or check out the branch name before the merge commit. The commit has two parents. `git add -A` includes restored files.

After the worktree matches upstream, put the overlay back:

*   A path upstream did not change since `e28f4d4e` is copied from the ALMA parent.
*   A path only ALMA has is copied from the ALMA parent.
*   A path both sides changed is a three-way merge. Keep upstream behavior and re-apply the ALMA rule that file already carried.
*   `scripts/sync-integrations-catalog.py` refreshes the marketing catalog onto `alma.com.do`. Logos stay self-hosted.

Call controls from upstream `#2853` stay on every signed-in page. The Call button keeps using the existing Grok Voice path (`ALMA_VOICE_PROVIDER=xai`). Do not add a second speak button. Hold to talk stays.

New account email copy upstream added is ALMA, not Rakazo. Spanish (`packages/auth/src/locales/es.ts` and any new `es` catalog) uses ALMA. Store and download links stay the App Store id `6829162072`, Play id `do.alma.app`, and `https://app.alma.com.do`.

`scripts/check-alma-overlay.sh` passes. Regenerate `scripts/alma-overlay-manifest.txt` from the diff against `upstream/main`.

## 2. Push and updates

`apps/mobile/lib/push.ts` already returns when `extra.eas.projectId` is missing. `apps/mobile/app.config.ts` sets `extra.eas.projectId` from `EXPO_PUBLIC_EAS_PROJECT_ID` when that variable is non-empty. No project id is committed. `GOOGLE_SERVICES_JSON` still points Android at a services file supplied at build time.

`expo.updates.enabled` stays `false`. The client already does nothing when updates are off. Do not add an updates URL or an EAS Update channel in this change. OTA waits until an ALMA-owned Expo project exists; EAS Update on that project is the host, not a new server in this repo.

## 3. Help docs

`alma.com.do` is WordPress and does not serve the markdown docs. The API serves them on the app origin:

*   `GET /docs` HTML index, Spanish first, then English.
*   `GET /docs.md` and `GET /docs/<name>.md` markdown.

Pages are the existing `docs/*.md` set minus every `self-host*` page. Copy is ALMA. No Rakazo host, no self-host guide. The help skill in `packages/adapters/src/builtin-skills.ts` uses `https://app.alma.com.do/docs.md` and `https://app.alma.com.do/docs/<name>.md`. The sidebar Docs link in `SidebarFooter.tsx` is `https://app.alma.com.do/docs`.

Any in-app link to `https://alma.com.do/support/` becomes `https://alma.com.do/en/soporte/`.

## 4. Report this response

Restore the control removed in `f7f97063` on web (message menu) and mobile (message menu). The server stores one `MessageReport` row per user and assistant message, as before. The migration `20261031120000_message_reports` stays; do not add a second migration that drops it.

On insert, email every address in `RAKAZO_ADMIN_EMAILS` when transactional email is configured. The body names the space, thread, message id, and a short excerpt of the assistant text. It does not include secrets. A repeat report does not send a second email. When email or the admin list is unset, the row is still stored.

## 5. Microphone purpose

English: `ALMA uses the microphone for dictation and voice calls.`

Spanish `apps/mobile/locales/es.json`: `ALMA usa el micrófono para dictar y para llamadas de voz.`

The same English sentence is the `microphonePermission` string on the Expo plugins that set it, and `NSMicrophoneUsageDescription` in `expo.ios.infoPlist` when that key is set there.

## 6. Android calls in the background

Undo the stripping from `597ccc14`. The call foreground service declares `microphone`. The agent-working notification service declares `remoteMessaging`. The manifest requests `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MICROPHONE`, and `FOREGROUND_SERVICE_REMOTE_MESSAGING`. Do not remove those with a plugin. Android 14 requires the permission that matches each `foregroundServiceType`.

## Decisions from review

A three-way conflict keeps upstream behavior and the ALMA value: the name ALMA, hosts `app.alma.com.do` and `alma.com.do`, price `6900`, no Models or Voice settings, `SUBMIT_PLUGIN_URL` null, and version floors `1.0.12`, iOS build `66`, Android `versionCode` `14`.

The docs index is Spanish, then English. Article bodies stay the English pages, rebranded. Self-host pages are left out, and links to them are removed.

Report mail goes only to `RAKAZO_ADMIN_EMAILS`. Subject: `ALMA response report`. No mailbox is committed.

`EXPO_PUBLIC_EAS_PROJECT_ID` and `GOOGLE_SERVICES_JSON` are Bitrise secrets. FCM v1 and the APNs key are uploaded to the Expo project, not stored on the API. The pull request base is `cursor/restore-integrations-ui-dd22`.

## Checks

`scripts/check-alma-overlay.sh`, `pnpm exec turbo check` for the packages this change compiles, and the unit tests those packages already have. Web e2e is CI.
