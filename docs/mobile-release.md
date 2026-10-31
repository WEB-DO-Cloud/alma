# Mobile builds and store releases

ALMA ships as an iOS and Android app with bundle id and package `do.alma.app`.
The name under the icon is ALMA. The store listing name is
`ALMA Asistente IA`.

Store builds use Expo prebuild, then fastlane, on Bitrise. Over-the-air updates
and the old Expo submit profile are not the store path. The icon in the repo is
a placeholder; final art is still pending.

## One-time match setup

Signing certificates live in the private repo
`https://github.com/WEB-DO-Cloud/alma-certificates`. That URL is the Matchfile
default. Override it with `MATCH_GIT_URL` when the certificates should come
from somewhere else. `MATCH_PASSWORD` encrypts the repo. Create it on a trusted
machine, store it as a Bitrise secret, and do not put it in git.

Do this once, from `apps/mobile`, on a machine that can sign in to Apple.
CI only reads the match repo. The one exception is a build whose parameter
`ALMA_MATCH_CREATE` is `true`: that run may create the certificate and profile
when the certificates repo is still empty. Do not store that parameter as a
standing secret. Leave it unset after the certificates exist.

HTTPS, with a GitHub personal access token that can read and write the
certificates repo:

```sh
cd apps/mobile
bundle install
export MATCH_PASSWORD='choose-a-long-password'
export MATCH_GIT_BASIC_AUTHORIZATION="$(printf '%s' 'git:GITHUB_TOKEN' | base64)"
export APP_STORE_CONNECT_API_KEY_ID='key id'
export APP_STORE_CONNECT_API_KEY_ISSUER_ID='issuer id'
export APP_STORE_CONNECT_API_KEY="$(cat AuthKey_example.p8)"
bundle exec fastlane match appstore
bundle exec fastlane match development
```

SSH deploy key instead of HTTPS: put the private key PEM in
`MATCH_GIT_BASIC_AUTHORIZATION` and point match at the SSH remote.

```sh
export MATCH_GIT_URL='git@github.com:WEB-DO-Cloud/alma-certificates.git'
export MATCH_GIT_BASIC_AUTHORIZATION="$(cat alma-certificates-deploy-key)"
```

The Matchfile uses that PEM only when the URL is SSH and the value contains a
private key. Otherwise it passes the value to match as
`git_basic_authorization`. A Bitrise SSH key loaded into the agent also works
for an SSH `MATCH_GIT_URL`; leave `MATCH_GIT_BASIC_AUTHORIZATION` empty in that
case.

`fastlane match appstore` and `fastlane match development` create the
distribution and development certificates in the empty repo. Later CI builds
only download them.

## Secrets to create in Bitrise

Leave `ALMA_STORE_RELEASE_APPROVED` unset. The release lane refuses to run
unless it is exactly `yes`, and even then it does not submit for App Store
review or promote a Play release.

| Secret | Purpose |
| --- | --- |
| `MATCH_PASSWORD` | Encrypts the certificates repo. Required. |
| `MATCH_GIT_URL` | Optional. Defaults to the certificates repo above. |
| `MATCH_GIT_BASIC_AUTHORIZATION` | Base64 `username:token` for HTTPS, or the SSH deploy key PEM. |
| `APP_STORE_CONNECT_API_KEY_ID` | App Store Connect API key id. |
| `APP_STORE_CONNECT_API_KEY_ISSUER_ID` | App Store Connect issuer id. |
| `APP_STORE_CONNECT_API_KEY` | Contents of the `.p8` key. |
| `APPLE_TEAM_ID` | Apple Developer team id. |
| `ITC_TEAM_ID` | Optional App Store Connect team id, when it differs. |
| `APPLE_ID` | Optional. The API key is enough for CI. |
| `SUPPLY_JSON_KEY_DATA` | Play service-account JSON, as text. |
| `ANDROID_KEYSTORE_BASE64` | Upload keystore, base64. Or set `ANDROID_KEYSTORE_PATH`. |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password. |
| `ANDROID_KEY_ALIAS` | Upload key alias. |
| `ANDROID_KEY_PASSWORD` | Upload key password. |
| `EXPO_PUBLIC_API_URL` | Firm API. Use HTTPS for a non-demo build. |
| `BITRISE_USE_UPLOADED_SIGNING` | Set to `true` only to install profiles uploaded in the Bitrise UI instead of match. |

`BITRISE_BUILD_NUMBER` is provided by Bitrise. The bump lane writes it to the
iOS build number and the Android version code before prebuild. Set
`ALMA_VERSION` only when the marketing version should change. Set
`ALMA_BUILD_NUMBER` when a build is not running on Bitrise.

## App Store Connect API key

In App Store Connect, open Users and Access, then Integrations, then App Store
Connect API. Generate a team key with access to the ALMA app. Download the
`.p8` once. The key id and the issuer id go in the two id secrets. Paste the
`.p8` contents into `APP_STORE_CONNECT_API_KEY`.

## Play service account

In Google Cloud, create a service account and a JSON key. In Play Console,
invite that account and grant it permission to release to testing tracks. Copy
the whole JSON file into `SUPPLY_JSON_KEY_DATA`. The internal lane uploads an
Android App Bundle to the internal track and no other track.

## What Bitrise runs

`bitrise.yml` uses the Xcode 27.1 stack `osx-xcode-27.1.x` for iOS and
`ubuntu-resolute-26.04-bitrise-2026-android` for Android and unit tests.
Confirm those stacks are enabled on the workspace. Native workflows install
pnpm, then `bundle install` in `apps/mobile`, then a fastlane lane.
`mobile-tests` runs `pnpm db:generate` after install so the privacy checks can
load the database client. Generate does not open a database connection.

Order for a signed build: bump, Expo prebuild, then gym or Gradle. iOS reads
the workspace Expo generates (scheme `ALMA`, override with `ALMA_IOS_SCHEME`
or `ALMA_IOS_WORKSPACE`).

| Workflow | Lane | When it runs |
| --- | --- | --- |
| `mobile-tests` | mobile unit tests | Push to `main` and pull requests |
| `android-debug` | `android debug` | Manual |
| `android-apk` | `android apk` | Manual. Signed APK, not uploaded |
| `android-aab` | `android aab` | Manual. Signed bundle, not uploaded |
| `ios-simulator` | `ios simulator` | Manual |
| `ios-archive` | `ios archive` | Manual. Signed archive, not uploaded |
| `manual-testflight` | `ios beta` | Manual. TestFlight only |
| `manual-play-internal` | `android internal` | Manual. Play internal track only |

`manual-testflight` and `manual-play-internal` are not in `trigger_map`.
Nothing in this file submits for App Store review or promotes a Play release
to production, beta, or alpha.

## Before Expo push

The Expo project id was removed so this app does not receive the previous
product's updates. Create an Expo project for `do.alma.app` before enabling
Expo push. Push payloads stay generic: the title is ALMA and the body is
`Hay un borrador pendiente de revisión`. The app loads the draft from the API.

Sentry reporting stays off unless the server offers a self-hosted DSN.
`EXPO_PUBLIC_SENTRY_ENABLED=0` turns that off too. A sentry.io DSN is ignored.
