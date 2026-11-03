# ALMA desktop release and local memory

*   **Author:** WEB-DO-Cloud/alma
*   **Status:** In Review
*   **Date:** 2026-11-03

--------------------------------------------------------------------------------

## Overview

This document covers two phases of the ALMA desktop app. Phase 1 publishes the existing Electron app as a thin client of `https://app.alma.com.do`. Phase 2 adds an optional semantic-memory store that lives in that app, on one computer of the space owner, and is reached from the server over the device socket the app already opens.

ALMA in this repository is a thin overlay on upstream Rakazo. Both phases keep the diff small and isolated so a rebase onto upstream stays mechanical. Neither phase renames `@rakazo/*`, the `rakazo://` scheme, `extraMetadata.name` (`rakazo`), the Linux `executableName` (`rakazo`), or `window.rakazoDesktop`.

The desktop app has not been published. `apps/desktop/package.json` is `0.4.0`. The `release-desktop` workflow has not produced a GitHub Release. There is no installed base to migrate.

## Terms

*   **Space.** The existing boundary for bots, chats, and memories. A memory in one space is never readable from another.
*   **Space owner.** A `SpaceMember` whose `role` contains `owner`. The same check already gates who may connect a memory provider.
*   **Semantic memory.** Recall by meaning through `SemanticMemoryProvider`: save, recall, forget, and purge of history summaries. This is separate from Markdown notes (`MEMORY.md` and shared memory files), which stay on the server in both phases.
*   **Server semantic provider.** Whatever provider the server uses when a space has no provider row. A self-hosted Honcho for the whole server is being added in another change. This document does not specify it. If that provider is absent, **ALMA memory** means semantic recall and save are off, which is today's behavior with no row. Phase 2 does not wait for that change.
*   **Paired desktop.** After sign-in, the desktop posts to `/api/devices/pair`, stores the returned token with Electron `safeStorage`, and opens an outbound WebSocket to `/api/devices/connect`. The server stores only a hash of the token. The client reconnects with jitter from 1 second up to 60 seconds. The settings picker lists `GET /api/devices` and offers only rows whose `connected` is true.
*   **History compaction.** The server replaces old turns of a chat with a summary and a generation number. That summary can be saved as semantic memory with `source.kind === "history"`. A durable row is a fact from the save tool (`source.kind === "durable"`). `purgeHistory` names generations to delete and must not delete durable rows.

## The Problem

The branded desktop shell already exists and has never shipped. It is Electron 45, packaged with electron-builder 26.15.3, and updated with electron-updater 6.8.11 from GitHub Releases. `release-desktop.yml` runs on a `vMAJOR.MINOR.PATCH` tag. The first-run screen offers three servers: **ALMA Cloud** (`https://app.alma.com.do`, saved as an `existing` setup), **This computer** (a full local Docker server), and **Existing instance** (any ALMA server address). The packaged bundle id is still `dev.rakazo.desktop`. The marketing site tells a desktop visitor to open the web app. It does not offer an installer. `docs/desktop-app.md` already says to download the app from alma.com.do.

ALMA's model and billing run on the server. A local Docker server inside the desktop app is a second product: the person would bring a model and would not be on the hosted account. Pointing the same app at a server the person already runs should remain possible, because the phone app already has a custom-server path and self-hosting stays part of the product.

The space owner can choose to keep semantic memories on their own computer instead of in the server provider. The threat this addresses is a durable copy of that semantic store on the server (the provider database, a queue of fact text, or logs). It does not address a person who can run code as the same OS user, and it does not keep a recalled fact out of the chat's model request. The screen has to say what actually happens. Chats, Markdown notes, and the model request stay on the server path.

A desktop that is off must not cause the semantic store to be written on the server.

## Goals

### Phase 1

*   A packaged Mac universal build (Apple silicon and Intel), a Windows x64 NSIS installer, and a Linux x64 AppImage, published by the existing `release-desktop` workflow from a `vMAJOR.MINOR.PATCH` tag on `main`.
*   The Mac build is signed and notarized with the Developer ID Application certificate for Apple team `QZ4X2QG998`. The Windows installer and the Linux AppImage ship unsigned.
*   The packaged app's bundle id is `do.alma.desktop` from the first release onward. `release-desktop.yml` fails the release if `build.appId` is anything else.
*   The packaged app opens `https://app.alma.com.do` by default. **This computer** is not offered. **Existing instance** still is.
*   The packaged app stores its own files under an `ALMA` directory, not under a directory named `rakazo`.
*   alma.com.do links to stable GitHub Release asset names for the Mac disk image, the Windows installer, and the Linux AppImage.
*   Signing secrets stay in GitHub Actions secrets. They are not copied to Bitrise, to the server environment, or into the repository.

### Phase 2

*   Settings → Memory offers **ALMA memory** (default) and **On this computer** (a paired desktop the owner picks).
*   The desktop store implements save, recall by meaning, forget, and history purge. It is SQLite plus sqlite-vec plus one bundled multilingual ONNX model. It is not Honcho and it does not start Docker.
*   The server reaches that store with a `memory` message on the existing device WebSocket. Shell access stays a separate consent. Each opted-in space is confirmed on the computer.
*   When that computer is offline or does not answer in time, recall contributes no semantic memories and the person sees a notice. A save is rejected and is not written to the server provider or to a server queue of fact text. A forget or a history purge that does not reach the computer is remembered as ids only and replayed when the computer is back, so a deleted fact does not return on the next recall.
*   The owner views, exports, imports, and deletes rows in a window bundled with the app, not in the remote web page. A browser or the phone cannot read the corpus.
*   The setting tells every member that chats go through ALMA servers, that these memories sit on the owner's computer, that the owner can export them, and that a memory the bot uses is sent with that chat.

## Non-Goals

*   Phase 1 does not add local memory, native embedding, or a new updater channel.
*   Phase 2 does not move chats, attachments, Markdown memory, routines, or the bot's computer onto the desktop.
*   Phase 2 does not run a local chat model, and it does not embed Honcho or Docker.
*   The phone app does not gain a local memory store.
*   Windows arm64 and Linux arm64 are not release targets.
*   Windows signing is not turned on in these phases.
*   `extraMetadata.name`, the Linux executable name, and `window.rakazoDesktop` stay as they are. A Linux process list can show `rakazo`. The dock name stays ALMA.
*   Upstream's three-server setup is not deleted from the source. The packaged ALMA app hides one choice.
*   No change to existing Postgres columns. Phase 2 adds no table. Pending deletes live in the provider row's existing JSON settings.

## Decisions

1.  **Hide This computer in the packaged app. Keep Existing instance.** This computer starts a full local server. Existing instance is how the desktop reaches a server the person runs. The three radios stay in `apps/desktop/src/setup.html`. The main process tells the setup window whether to show the local-server radio. It is shown when the app is not packaged, or when `ALMA_DESKTOP_LOCAL_SERVER=1`. A packaged build hides the radio and its panel, and rejects a saved or submitted `mode: "new"`. `RAKAZO_WEB_URL` still skips setup. Unpackaged `pnpm dev` and the desktop Playwright suite still see This computer.
2.  **Change the bundle id before the first tag.** `build.appId` becomes `do.alma.desktop`. Nothing installed uses `dev.rakazo.desktop`, so there is no user-data move, no keychain move, and no updater handoff. The release workflow fails if the id is not `do.alma.desktop`. That is the pin. `docs/designs/alma-rebrand.md` left the old id so an update would match. That reason does not apply before the first release. This document supersedes that one row. The historical rebrand document is not edited.
3.  **One stable update channel.** electron-updater already sets `allowPrerelease` and `allowDowngrade` to false. The workflow accepts only `vMAJOR.MINOR.PATCH` and writes `latest-mac.yml`, `latest.yml`, and `latest-linux.yml`. No beta channel and no custom feed URL. The human download is the `.dmg`. The `.zip` is the Mac updater payload and is not linked on the site.
4.  **Stable asset names, no site rebuild.** The builder names the human artifacts `ALMA-mac.dmg`, `ALMA-Setup.exe`, and `ALMA-linux.AppImage` (no version in the filename). The Mac updater zip is `ALMA-mac.zip`. The homepage links to `https://github.com/WEB-DO-Cloud/alma/releases/latest/download/` plus those three names. GitHub serves the asset from the release marked latest. The app does not update from the website. Publishing a release does not require an Astro rebuild. Until the first release, those URLs 404, and the homepage says so.
5.  **Packaged user data is `ALMA`.** Before reading setup or devices, a packaged build sets `userData` to the platform config directory named `ALMA`: `~/Library/Application Support/ALMA`, `%APPDATA%\ALMA`, or `${XDG_CONFIG_HOME:-~/.config}/ALMA`. Unpackaged builds keep Electron's default path so tests and developer state stay put. `extraMetadata.name` stays `rakazo`. Two packaged apps on one machine do not share a device token or a memory file, because no published build has written the old path.
6.  **Secrets.** Desktop signing material stays in the GitHub Actions secrets named in `docs/desktop-release.md`: `DESKTOP_MAC_CSC_LINK`, `DESKTOP_MAC_CSC_KEY_PASSWORD`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`, `APPLE_API_KEY_P8`, and the optional `DESKTOP_MAC_PROVISIONING_PROFILE`. Windows signing secrets stay unset. Bitrise builds the phone app and keeps Match certificates for `do.alma.app`. It does not receive the Developer ID certificate.
7.  **Passkeys do not block the first desktop release.** The macOS associated-app id is `QZ4X2QG998.do.alma.desktop`. The server's `PASSKEY_APPLE_APP_IDS` must include that value before desktop passkeys work. Until `DESKTOP_MAC_PROVISIONING_PROFILE` is a profile for that App ID, the workflow's existing path applies: the release ships and the Mac app hides passkeys.
8.  **On this computer is one owner and one device.** Only an owner can select it. The row stores that owner's user id and the chosen `deviceId`. Later calls go to that user and that device, including when a member started the run. Another computer is not a fallback. If that person loses the owner role, calls fail closed. Any remaining owner can switch the space back to **ALMA memory** without the computer answering.
9.  **No server-side copy of fact text.** Offline and timeout reject a save. The desktop queues only a save it has accepted and whose model is loaded. Pending forgets and purges store ids and generation numbers only.

## Open Questions

*   **Windows signing cost.** Azure Artifact Signing is already wired and stays off while `DESKTOP_WIN_AZURE_CLIENT_ID` is unset. This design does not estimate that cost. The first Windows download is unsigned either way. Turning signing on later uses the existing workflow and does not change the bundle id. Unsigned Windows updates trust the first signed update, then require the same publisher. That rule is already in `docs/desktop-release.md`.

## Critical User Journeys (CUJs)

### CUJ 1: First launch of the packaged app

*   **Given**: A packaged build, `ALMA_DESKTOP_LOCAL_SERVER` unset, no saved setup, `RAKAZO_WEB_URL` unset.
*   **When**: The person opens ALMA.
*   **Then**: Setup shows **ALMA Cloud** and **Existing instance**. It does not show **This computer**. Continue on ALMA Cloud saves `{ mode: "existing", serverUrl: "https://app.alma.com.do" }` and opens that origin. Files land under the `ALMA` user-data directory.

### CUJ 2: A self-hosted server

*   **Given**: The same packaged build.
*   **When**: The person chooses **Existing instance**, enters an address, and checks the connection.
*   **Then**: The address is normalized to an origin. `http` is accepted only for a loopback or private-network host. Any other host must be `https`. A URL with a username or password is rejected. A path is dropped. Optional headers are the existing name/value list. Check connection probes that origin and does not follow a redirect. On success the app opens it and does not start Docker.

### CUJ 3: Unpackaged development

*   **Given**: `pnpm dev`, or `ALMA_DESKTOP_LOCAL_SERVER=1` in a packaged build.
*   **When**: Setup opens.
*   **Then**: **This computer** is shown and works as it does today.

### CUJ 4: The owner stores memories on one computer

*   **Given**: The owner is signed in. The desktop for that origin is paired and its socket is connected. The space has no `desktop` provider row.
*   **When**: The owner chooses **On this computer** and picks that connected computer.
*   **Then**: The server sends `grant` with the space id, the device id, and the space's display name. The desktop shows a native dialog for that pair of origin and space, even if another space on the same origin was already allowed. The dialog's Allow is the only way the space enters the allowlist. The server writes `provider: "desktop"` and `settings.deviceId` only after the acknowledgement. Cancel or silence writes nothing. The dialog does not grant shell access.

### CUJ 5: Recall and save while the computer is online

*   **Given**: CUJ 4 completed. A member sends a chat. The run's user id is the member.
*   **When**: The agent recalls or saves semantic memory.
*   **Then**: The server sends a `memory` message to the owner's chosen device. The desktop checks the socket's origin and the allowlist, embeds in a worker thread, and reads or writes SQLite. Markdown notes are still read and written on the server. A recalled fact is placed in that run's model input and is not written to a memory table.

### CUJ 6: The computer is offline

*   **Given**: The chosen device has no connection with a heartbeat newer than 75 seconds (three times the server's 25 second device ping).
*   **When**: A run recalls, and the agent tries to save a fact and to forget one.
*   **Then**: Recall adds no semantic memories to the model input. The save is not sent to the server semantic provider, not written to Postgres as fact text, and not queued. The forget's id is appended to `settings.pendingDeletes` and is not described as deleted. The run shows the notices in Copy. Markdown tools still work. The honesty sentence already says those notes stay on ALMA. A later save of the same fact, once the computer is connected, is one row.

### CUJ 7: The owner inspects local memories

*   **Given**: The desktop app is open on the computer that holds the file.
*   **When**: The owner chooses **Memories on this computer** from the app menu, or the matching button in Settings.
*   **Then**: The main process opens a bundled local window, the same kind of window as setup, with no remote origin. The list is IPC inside that window. Export asks with a native confirm, then a native save dialog. Import, delete, and delete-all do not open a socket. A normal browser has no such window. The remote page's only bridge call opens this window and returns no text.

### CUJ 8: Switching back, and a dead computer

*   **Given**: The space uses **On this computer**.
*   **When**: Any current owner selects **ALMA memory**, including while the computer is offline.
*   **Then**: The server deletes the provider row immediately. It does not wait for the desktop. Local rows stay until someone at that computer deletes them. They are not uploaded. Choosing **On this computer** again does not import the server provider's memories.

### CUJ 9: The same computer pairs again

*   **Given**: The owner reinstalls the app or pairs again, so the server issues a new `deviceId`. The OS user and the `ALMA` directory are unchanged.
*   **When**: The owner picks the new device in Settings and accepts `grant` for the space.
*   **Then**: The existing file is used. Rows are keyed by origin and space id, not by `deviceId`. A new computer does not have the file. Memories move only by export and import. If the old computer is gone and there is no export, those rows are gone.

### CUJ 10: The store cannot be opened

*   **Given**: The key file or the OS keychain entry is missing, or the model file failed to load.
*   **When**: The owner opens the local window, or a save arrives.
*   **Then**: The window says the store cannot be opened. It offers **Delete local file** (explicit, removes the SQLite file and the key file) and does not mint a new key over an existing file. A save returns `unavailable`. Any owner can switch the space to **ALMA memory** without this computer.

## Technical Plan (Architecture)

```text
Phase 1
  alma.com.do  -->  releases/latest/download/ALMA-mac.dmg
                    ALMA-Setup.exe
                    ALMA-linux.AppImage
  ALMA.app     -->  electron-updater latest channel, same GitHub repo
                 -->  userData directory "ALMA"
                 -->  https://app.alma.com.do
                      (Existing instance: another https origin)

Phase 2
  Chat on web, desktop, or phone
        |
        v
  API / worker
        |  provider "desktop"
        |  owner user id + settings.deviceId
        |  pendingDeletes are ids only, applied before recall
        v
  UserDeviceGateway  (existing socket + internal forward)
        |  type "memory"          (not a host-computer command)
        v
  Desktop main process
        |  per-space consent, allowlist keyed by origin + spaceId
        v
  worker thread
        |  ONNX embed, SQLite + sqlite-vec
        |  text encrypted; vectors and lookup columns are not
        v
  local file only

  Owner's list: bundled local window, not the remote page
```

The device socket is outbound. The server never dials the computer. Processes that do not hold the socket forward to the process that does, with the existing internal bearer derived from the server encryption key. Phase 2 does not add a queue of fact text, a global slot limit, or a second socket.

Shell requests and memory requests share the socket and stay different consents. A `memory` message must not call the computer-access consent and must not start the host-computer runner. Turning off **Let bots use this computer** cancels shell work and leaves memory serving. **Stop serving memories** in the local window turns memory off for one origin and leaves rows in place. Revoking the device closes the socket and stops both.

An old desktop drops a frame that fails its parser. The new message has no `method`, `argv`, or `command` field, so it is not a host-computer request. The server then hits its deadline and follows CUJ 6. An old server never sends `memory`. A previous API process that cannot parse a memory forward returns an error, and the caller treats that as offline. It does not write the fact. The tests include the previous zod unions as fixtures and assert both rejections.

### Phase 1 release

| Platform | Artifact | Signing |
| --- | --- | --- |
| macOS universal | `ALMA-mac.dmg` for people, `ALMA-mac.zip` for the updater | Developer ID Application, team `QZ4X2QG998`, notarized. The workflow already requires the five Mac secrets and fails closed without them. |
| Windows x64 | `ALMA-Setup.exe` | Unsigned while the Azure client id secret is unset. `verifyUpdateCodeSignature` stays true. |
| Linux x64 | `ALMA-linux.AppImage` | Unsigned. The AppImage still needs FUSE 2, which `docs/desktop-app.md` already says. |

Unsigned Windows and Linux updates are authentic only as far as the GitHub Release is. `release-desktop.yml` publishes that release from a `vMAJOR.MINOR.PATCH` tag that is on `main`, matches `apps/desktop/package.json`, and is newer than the latest stable release. A person who can push such a tag, or who can change that workflow on `main`, can ship the next build. Mac builds are also signed and notarized. That is the update trust model for the first release. Phase 2's store is decrypted by whatever binary the person is running.

The GitHub Release title becomes `ALMA <tag>` instead of `Rakazo <tag>`. The homepage uses the platform strings the site already has (`Download for macOS`, and the other locales' existing translations). Phase 1 adds only the sentences in Copy.

`docs/desktop-app.md` stops telling a packaged-app reader to choose **This computer**. The self-host guide stops telling that reader that the desktop app installs a local server. Self-host stays Docker or **Existing instance**.

Passkey examples that show `dev.rakazo.desktop` as the desktop bundle id show `do.alma.desktop` instead. The sample team id in that example stays a sample. The real App ID is `QZ4X2QG998.do.alma.desktop`, set in the server environment.

### Phase 2 provider

Provider id: `desktop`. The factory gains one adapter. `requiresPrivateEndpoint` is false. `prepare` checks that the caller owns the space, that `deviceId` belongs to that user, and that the connection is fresh. It does not probe a URL. Stored credentials are `{}`. The device token is not copied into the space secret.

Routing ignores the run's user id. A new gateway method sends the memory message. The existing `request` method stays typed to host-computer commands.

Scope follows the interface. An isolated row is recalled only for its `botId`. A shared row is recalled for every bot in the space on a shared recall, and not on another bot's isolated recall. Shared dedup and shared forget ignore `botId`: one shared fact is one row, and any bot in the space may forget it by id. Isolated dedup and isolated forget include `botId`. Every row and every message includes `origin` and `spaceId`. The origin is the socket's server origin, not a field the renderer supplies. A message whose socket origin does not match the row is rejected and does not read the database.

Save deduplicates on an HMAC-SHA256 of the normalized text (trim, collapse whitespace, lower case), keyed with the data key, within the same origin, space, scope, and, for isolated rows, bot. The ciphertext is not comparable. The HMAC shows which rows are equal. It does not show the text. The server's save id is a UUID stored on the row. A replay with the same id and the same HMAC returns the first result and does not insert. A replay with the same id and a different HMAC returns `invalid` and does not insert.

`source.kind === "history"` stores the summary with its generation number (a non-negative integer). On that save, the desktop also deletes history rows for that bot in that space whose generation is more than 30 below the new one. `purgeHistory` deletes the named generations for that bot and does not delete durable rows. `forget` deletes one durable row, with the scope rule above. A missing id is `not-found`.

Recall embeds the query, searches sqlite-vec, and returns at most the requested limit. The server asks for at most 5. The desktop caps the limit at 5. Results whose ids are in `pendingDeletes` are omitted even if the desktop still has them. Each result includes the text, a cosine score in `[0, 1]`, and the row id. There is no absolute score floor. A floor would be a guess until Spanish scores are measured, and a guessed floor either hides real matches or does nothing. The fixture below is the gate. Top-5 can include a weak neighbor when the store is large. That is accepted for this phase.

Text limits: a saved fact is at most 8192 bytes, a recall query at most 10000 characters. Larger input is `too-large`.

`settings.pendingDeletes` is a list of `{ op: "forget", id, scope, botId }` or `{ op: "purgeHistory", botId, generations }`. No text and no query. The list is capped at 200. The provider applies it before recall, save, or forget, on the same socket, inside that call's deadline. Applied entries are removed. A forget that cannot be recorded because the list is full returns `unavailable` and shows the forget notice. Selecting **ALMA memory** clears the list with the row.

At most two memory operations are in flight to one device. A third returns `unavailable` immediately and does not wait. The chat turn is not held for it. The cap is the one computer, not a global slot.

The file holds at most 10,000 rows per origin and space. A save past the cap returns `unavailable`. The owner deletes rows from the local window.

### Local store

The file is `<userData>/memory/desktop-memory.sqlite`, directory mode `0700`, file mode `0600`. On Windows those modes are not a security boundary. The file sits in the user's profile, and DPAPI protects the key. `better-sqlite3`, `sqlite-vec`, and `onnxruntime-node` are dependencies of `apps/desktop` only. The API and the worker do not import them. They are rebuilt for Electron 45 and, on Mac, signed and notarized with the app. One worker thread owns the database and the ONNX session. The main process does not embed and does not run a query, so a slow embed cannot freeze the window or delay the socket ping.

Columns stored in the clear, because the query needs them: `id` (UUID), `origin`, `spaceId`, `botId`, `scope`, `sourceKind`, `generation` (null for durable), `hmac` (32 bytes), `createdAt`, `embedding` (384 float32 values, or null while a row is waiting to be embedded). The fact text is AES-256-GCM ciphertext. The nonce is random, so equal facts do not have equal ciphertext.

The embedding model is the ONNX file `onnx/model_quantized.onnx` from `Xenova/multilingual-e5-small` (the q8 export of `intfloat/multilingual-e5-small`, 384 dimensions, MIT, about 118 MB). The published blob hash is `f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193`. The desktop release build that includes Phase 2 downloads that file, checks the hash, and bundles it. A mismatch fails the build. The running app does not download a model. Phase 1's installer does not contain it. Queries are prefixed with `query: ` and stored facts with `passage: `, then mean-pooled and L2-normalized. The reported score is the dot product of the two normalized vectors, clamped to `[0, 1]`.

The worker loads the session when the first `grant` for this process is acknowledged, and again at startup when the allowlist is non-empty. A save while the session is not loaded returns `unavailable` and is not written. A save while the session is loaded writes the ciphertext and the HMAC, returns success, and fills the vector afterward. Recall skips a row with a null vector. If embedding still has not finished by the next launch, the local window shows that row as not searchable and the owner can delete it.

The Spanish fixture is three pairs. For each, the related score must exceed the unrelated score by at least 0.15:

| Passage | Related query | Unrelated query |
| --- | --- | --- |
| `Las facturas se envían a la carpeta de finanzas.` | `¿Dónde hay que mandar las facturas?` | `¿A qué hora sale el ferry a Samaná?` |
| `La audiencia es el martes a las nueve.` | `¿Qué día es la audiencia?` | `El café está en el estante de arriba.` |
| `El cliente prefiere que le escriban en español.` | `¿En qué idioma hay que escribirle al cliente?` | `Hay que renovar el extintor del pasillo.` |

Unit tests of the protocol and the SQL use a fake embedder. The fixture runs when the vendored file is present.

### Protocol

Server to device, one JSON text frame:

```text
{ type: "memory", id, op, origin, spaceId, body }
```

`id` is a UUID. `origin` is the server origin the desktop is connected to. The desktop ignores a frame whose `origin` does not match the socket it received the frame on. `op` is `grant`, `recall`, `save`, `forget`, or `purgeHistory`. The frame has no `method`, `argv`, or `command`.

| op | body | result |
| --- | --- | --- |
| `grant` | `{ deviceId, spaceName }` | Dialog, then allowlist add. `spaceName` is a label, at most 128 characters. |
| `recall` | `{ botId, scope, query, limit }` | `{ results: [{ id, memory, score }] }` |
| `save` | `{ botId, scope, content, source }` | `{ id }` |
| `forget` | `{ botId, scope, id, reason? }` | `{ id, expired, reason }` |
| `purgeHistory` | `{ botId, generations }` | empty success |

`scope` is `isolated` or `shared`. `source` is `{ kind: "durable" }` or `{ kind: "history", generation }`.

Device to server:

```text
{ type: "memory-result", id, ok: true, value }
{ type: "memory-result", id, ok: false, error }
```

`error` is one of `offline`, `timeout`, `not-allowed`, `unknown-space`, `unavailable`, `too-large`, `not-found`, `invalid`. It carries no memory text, no query, and no path. `cancel` and `revoked` apply to an in-flight memory id.

The internal forward body becomes a discriminated union: the existing host-computer request, or a memory message. The forward secret is unchanged.

The desktop serves `recall`, `save`, `forget`, and `purgeHistory` only when memory consent is on for that origin and the origin-space pair is on the allowlist. Otherwise it returns `not-allowed` or `unknown-space` and does not read the database.

Leaving **On this computer** does not erase the file. **Stop serving memories** stops answers for that origin and keeps the file. **Delete all on this computer** removes that origin and space, and its allowlist entry. If the server still has `provider: "desktop"`, the next call returns `unknown-space` until the owner opts in again or switches to **ALMA memory**.

### Security

Threat model for Phase 2:

| In scope | Control |
| --- | --- |
| A durable semantic store on the server | No fact text in Postgres, in the server provider, in logs, or in a save queue. Pending deletes are ids and generation numbers. |
| Another space, or another server origin, reading this file | Allowlist and rows keyed by the socket's origin plus space id. Per-space native confirm. |
| A copied database file without the keychain | AES-GCM text. The key is only in `safeStorage`. |
| Shell access implied by memory, or the reverse | Separate consents. Memory messages never enter the host-computer runner. |
| The remote web page reading the corpus | The corpus bridge is not on the remote page. Export needs a native confirm in the local window. |

Out of scope, and not claimed:

*   Another process running as the same OS user. `safeStorage`, DPAPI, and the secret service will give that process the key.
*   Someone who has the file and the model. The clear vectors can be inverted well enough to recover much of a short sentence. The file modes do not prevent that.
*   The paired server, for spaces the person confirmed. It sends queries and saves, and it receives recall text. It can ask one fact at a time. It cannot list the corpus through this protocol.
*   The chat transcript and the model vendor. A fact the person typed is in the chat. A fact the bot recalls is in that run's model input. The model vendor's retention is not changed here.
*   Markdown notes. They stay on the server on purpose.

Other rules:

*   The socket's existing device token is the only device credential.
*   Logs for this provider record the op, the origin, the space id, the device id, and the error code. They do not record the query, the fact, the HMAC, or the embedding.
*   A member cannot change the setting, open the local window on the owner's computer, or export. Chats they send can still cause the agent to save a fact onto the owner's computer. The honesty sentence says that, and that the owner can export.
*   Linux `safeStorage` on the `basic_text` backend is already unavailable for the device token. The same rule blocks memory. The database is not created.
*   A missing key beside an existing database does not mint a new key.

### Timeouts and latency

Recall runs inside the chat turn, in the same parallel load that already calls the semantic provider. It must not take a global lock.

| Call | Deadline | On deadline |
| --- | --- | --- |
| `recall`, including pending deletes applied first | 2.5 seconds | No semantic memories added, recall notice, log `desktop-memory.timeout`. Pending deletes that did not finish stay on the list. |
| `save` | 5 seconds | `{ ok: false }`, no retry of the body. Dedup keeps one row if the desktop committed and the same text is saved later. |
| `forget`, `purgeHistory` | 5 seconds | Id-only pending entry, forget notice. Not a retry of fact text. |
| `grant` | 60 seconds | Time for the person at the dialog. Cancel or silence leaves the provider row unwritten. |

The 2.5 second figure is a cap so a lost socket cannot hold the turn. It is not a measured embed time. Embedding runs on the worker thread. The desktop answers `unavailable` immediately when the session failed to load. A sleeping computer can look connected for up to 75 seconds. The first call still ends at this deadline. These deadlines are not the host-computer deadlines.

When the owner's computer is asleep, every member of the space loses semantic recall and sees the notice. They cannot opt out. Only an owner can turn the choice on, and only an owner can switch it off.

### Copy

English is the source string. Spanish is the `es` catalog. Other catalogs translate the English sentence. The product names for the choices are the Spanish ones.

The honesty sentence is this long because each shorter version is false. "Stay on this computer" alone hides the model request and the owner's export. Dropping the server clause hides that chats and Markdown notes are not local.

| Where | English source | Spanish |
| --- | --- | --- |
| Memory choice, default | `ALMA memory` | `Memoria ALMA` |
| Memory choice, this device | `On this computer` | `En mi computadora` |
| Honesty, under the choice, every member | `Chats still go through ALMA servers. Memories saved with On this computer stay on the space owner's computer, and that person can export them. When a bot uses one, it is sent with the chat. They are not kept in ALMA's memory store.` | `Los chats siguen pasando por los servidores de ALMA. Las memorias guardadas con En mi computadora permanecen en la computadora del propietario del espacio, y esa persona puede exportarlas. Cuando un bot usa una, se envía con el chat. No se guardan en el almacén de memoria de ALMA.` |
| Notice, recall missed | `Saved memories on the owner's computer were not available for this reply.` | `Las memorias guardadas en la computadora del propietario no estuvieron disponibles para esta respuesta.` |
| Notice, save rejected | `A new memory was not stored on the server.` | `Una memoria nueva no se almacenó en el servidor.` |
| Notice, forget or purge not applied | `A memory was not deleted because that computer is offline. It will be deleted when the computer is back.` | `No se eliminó una memoria porque esa computadora está desconectada. Se eliminará cuando la computadora vuelva.` |
| Native consent title | `Save memories for this space on this computer?` | `¿Guardar las memorias de este espacio en esta computadora?` |
| Native consent detail | `Space: {spaceName}. Server: {origin}. Chats still go through ALMA servers. This does not let bots run commands.` | `Espacio: {spaceName}. Servidor: {origin}. Los chats siguen pasando por los servidores de ALMA. Esto no permite que los bots ejecuten comandos.` |
| Keychain or model unavailable | `This computer cannot store memories securely.` | `Esta computadora no puede guardar memorias de forma segura.` |
| Homepage, under the download buttons | `If the download does not start, the desktop app is not published yet.` | `Si la descarga no empieza, la app de escritorio todavía no está publicada.` |
| Homepage, Windows button only | `Windows may say it does not recognize this installer. It is not signed yet.` | `Windows puede avisar que no reconoce este instalador. Todavía no está firmado.` |

The run event is `memory.unavailable` with `{ reason: "offline" | "timeout" | "unavailable", recall: "missed" | "ok", save: "rejected" | "none", forget: "rejected" | "none" }`. The client shows the matching sentences, in that order, as one notice. The server sends codes, not sentences. The notice is not inserted into the model prompt. Markdown context is unchanged, so the recall sentence does not say the reply has no memories at all.

The local window's controls: `Memories on this computer`, `Export`, `Import`, `Delete`, `Delete all on this computer`, `Stop serving memories`. Spanish: `Memorias en esta computadora`, `Exportar`, `Importar`, `Eliminar`, `Eliminar todo en esta computadora`, `Dejar de servir memorias`.

### Local window and export

`apps/desktop` ships `memories.html` the way it ships `setup.html`. The app menu and a settings button call the preload to open it. That call returns no memory text. The remote origin cannot list, export, or delete.

Export is JSON, version `1`, with `origin`, `spaceId`, and rows of `id`, `text`, `scope`, `botId`, `source`, and `createdAt`. No embeddings and no key. The native confirm comes first. Import accepts only version `1`, only when the file's origin and space id are on this device's allowlist, and re-embeds locally. Import does not open a socket.

## Alternatives

*   **Hide Existing instance as well as This computer.** Rejected. The phone can already point at another server. A packaged app with no address field cannot be used against a self-hosted or staging origin without an environment variable.
*   **Keep `dev.rakazo.desktop`.** Rejected for the first release. Nothing installed is on that id. Shipping it would bind passkeys and the updater to the upstream id. Keeping `extraMetadata.name` and the Linux executable name still limits the rebase. User data is redirected by `app.setPath` instead of by renaming that field.
*   **A beta update channel.** Rejected. The workflow is a single stable channel, and there is no first release yet.
*   **Put the Developer ID certificate in Bitrise.** Rejected. Bitrise does not build this Electron app. The phone pipeline keeps its own distribution certificate.
*   **Bake download URLs at site build time.** Rejected. The site would keep "not published" until someone rebuilt it after the tag, and a failed GitHub request would have to choose between a green build and a stale page. Stable `releases/latest/download` names do not need a rebuild.
*   **Implement local memory as a host-computer command.** Rejected. Those commands wait on shell consent and use multi-minute deadlines.
*   **Run Honcho or Docker inside the desktop app.** Rejected. Phase 1 hides the local server. The store is a library in the app.
*   **Fall back to the server provider, or queue fact text in Postgres, when the computer is offline.** Rejected. That is a server-side copy of the store. Id-only pending deletes are not that queue.
*   **Download the ONNX file on first opt-in.** Rejected. The first save would wait on a network fetch, and a substituted file would be checked at the moment of use instead of at the release build. The 118 MB is in the Phase 2 installer only.
*   **Embed on the server.** Rejected. Import and the local window must re-embed while the socket is down. A server embed also leaves the vectors on the server, which is the copy this phase avoids.
*   **Scan vectors in JavaScript and skip sqlite-vec.** Rejected. The cap is 10,000 rows of 384 floats. sqlite-vec keeps that scan in the database file the worker already opens, and it is the store the product asked for. A second scan implementation would exist only to delete a dependency the release has to notarize anyway beside `better-sqlite3` and `onnxruntime-node`.
*   **Keep ciphertext on the server and the key on the desktop.** Rejected. The ciphertext would be a server-side copy the offline rule forbids.
*   **Encrypt the vectors and scan decrypted rows.** Rejected. sqlite-vec cannot search ciphertext. The accepted limit is a clear vector.
*   **Expose list and export on the remote page or the phone.** Rejected. The remote origin is code the server sends. A bundled window does not give that origin the corpus.
*   **One confirm per origin, with the server naming later spaces.** Rejected. After the first approval the allowlist would be the server's word. Each space has its own dialog.

## Risks

*   **A rebase edits `build.appId` or the setup radios.** The id is one field, and the workflow rejects any other id. The radios stay in the HTML. Reviewers should refuse a drive-by rename of `rakazo` identifiers in the same change.
*   **Passkeys on Mac stay hidden** until the operator creates the App ID and sets the provisioning profile and `PASSKEY_APPLE_APP_IDS`. Sign-in still works.
*   **Unsigned Windows.** People see SmartScreen. The homepage says so. Do not disable `verifyUpdateCodeSignature`.
*   **Native modules on Electron 45.** sqlite, sqlite-vec, and onnxruntime must load in the packaged apps. A platform that cannot load them fails the Phase 2 desktop build. The API image does not contain them. The ONNX hash is part of that build.
*   **The server sees fact text in transit and in the model input.** The tests assert the provider log has no fact body. They do not assert anything about the model vendor.
*   **A lost save response.** The server does not retry the body. Dedup keeps one row if the same text is saved again.
*   **Side-by-side deploys.** New messages fail the previous parsers. Both sides look offline. No existing column changes.
*   **The former owner's disk.** After they lose the owner role, the file remains on their computer until they delete it. Remaining owners can point the space back at **ALMA memory**. They cannot wipe the other person's disk.
*   **Members.** Facts from their chats can land on the owner's computer. The sentence under the setting is the notice. There is no per-member delete.

## Effort

Phase 1 is the setup boolean, the `appId` field, the `userData` path, the release title, the stable artifact names, the homepage links, and the docs that name the old id or **This computer**. No new native dependency and no migration. Publishing the tag stays the existing release process, after the Mac secrets are present and this phase is on `main`.

Phase 2 is a server provider with no native code, one socket message and one forward-body variant, id-only pending deletes in existing JSON, the desktop worker (three native modules and the vendored model), the settings choice, the run notice on web and mobile, and the bundled local window. The native rebuild and notarization is the part that can fail on a platform the rest of the app already builds.

Phase 1 does not wait for Phase 2. The first release can ship without local memory.

## Tests

Phase 1, offline, in the existing desktop unit tests:

*   Packaged predicate hides **This computer** and rejects `mode: "new"`. Unpackaged shows it. `ALMA_DESKTOP_LOCAL_SERVER=1` shows it when packaged.
*   `build.appId` is `do.alma.desktop`. The workflow file contains that id as the release check.
*   A packaged path helper returns the `ALMA` directory. An unpackaged helper does not call `setPath`.
*   Homepage links are the three `releases/latest/download` URLs. No test fetches GitHub.

Phase 2, offline, with a fake embedder and an in-memory socket:

*   The previous host-computer zod union, copied in the test, rejects a memory message. The previous forward union rejects it. The new memory union rejects a message that contains `method` or `argv`.
*   The provider routes to the stored owner and `deviceId` when the run user is a member.
*   A stale connection does not call the server semantic adapter and does not insert fact text. A forget in that case adds an id to `pendingDeletes`. The next recall omits that id.
*   A third in-flight op on one device is `unavailable` and does not wait.
*   Two origins and two space ids in one file: recall never crosses either key. A space absent from the allowlist does not read rows.
*   Shared dedup is one row across bots. Isolated dedup is per bot. Shared forget by a different bot deletes the row. `purgeHistory` removes named generations and leaves durable rows. A generation more than 30 behind is deleted on the next history save.
*   Same save UUID and same HMAC does not insert. Same UUID and a different HMAC is `invalid`.
*   A save while the model session is unloaded is `unavailable` and writes nothing.
*   The provider log fixture contains the error code and does not contain the fact text.
*   Linux `basic_text` leaves the database uncreated. A missing key file does not create a new key.
*   A memory message does not consult shell consent and does not call the host-computer runner.
*   The remote preload's open call returns no text. The list handler is not registered on the remote page.

The Spanish fixture runs only when the vendored ONNX file is present, and it asserts the 0.15 gap on each pair.

## Implementation plan

Phase 1, in one change:

1. Set `build.appId` to `do.alma.desktop`. Make `release-desktop.yml` fail on any other id. Update tests and the passkey example that name `dev.rakazo.desktop`. Leave `extraMetadata.name` and `linux.executableName`.
2. Set packaged `userData` to the `ALMA` directory before any read.
3. Pass the local-server boolean into the setup window. Hide and reject **This computer** when it is false.
4. Set the artifact names and the GitHub Release title. Point the homepage buttons at the three stable download URLs and add the two new sentences.
5. Update `docs/desktop-app.md` and the self-host guide sentences that tell a desktop user to install a local server from the app.

Phase 2, after Phase 1, in one change:

1. Add the `memory` and `memory-result` schemas and the gateway method. Branch the desktop client so those messages never enter the host-computer runner.
2. Add the `desktop` provider, `pendingDeletes`, and the settings choice. `grant` is per space and is acknowledged before the row is written. **ALMA memory** deletes the row without an acknowledgement.
3. Add the worker, the SQLite store, the keychain key, the vendored model, and `memories.html`.
4. Emit `memory.unavailable` and render the notice on web and mobile.
5. Run the tests above. The release build that first bundles the model checks the ONNX hash and loads the native modules on each packaged platform.
