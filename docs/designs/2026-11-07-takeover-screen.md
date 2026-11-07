# Takeover must mount the control screen

*   **Status:** Implementing
*   **Date:** 2026-11-07
*   **Upstream:** [elie222/rakazo#3948](https://github.com/elie222/rakazo/pull/3948) merged as `72c5a0ad` (2026-11-07). Not in ALMA `c52ad609`.
*   **Out of scope:** reconnect backoff ([#3442](https://github.com/elie222/rakazo/pull/3442), already here), [#3268](https://github.com/elie222/rakazo/issues/3268), [#3208](https://github.com/elie222/rakazo/pull/3208).

## Problem

Take control on a running computer returns success, then the screen shows "Screen not connected" and "The screen connection closed." Retry and Recover are the only actions. The watch socket had already connected. No control socket is opened.

## Cause

The panel and the full window draw one iframe. Its key does not include the screen address, so a new address only changes `src` on that same element (`apps/web/src/pages/shell/computer-overlay.tsx`, `computer-panel.tsx`).

Take control grants the lease, then the tab reads the screen (`use-computer.tsx` `bootComputer` → `refreshComputerScreen`). That read is what asks the computer for an input-capable session (`apps/api/src/routes/computer.ts` `screenUrl`, `interactive: holder`). The watch capability stays watch-only. The control capability is a different `/novnc/session/control/…` address.

The watch page is still the document inside the iframe when its socket closes. The page reports `disconnected` (`apps/web/src/novnc-html.ts`). The app listens on that iframe's window (`use-computer.tsx`). A screen-address change calls `loaded()`, which forgets that this screen had connected (`packages/core/src/screen-reconnect.ts`). The late `disconnected` is then a first load that never connected, which is a terminal error (`report` returns `"error"`). The error replaces the iframe, so the control page never loads and its socket is never opened.

The control process on the computer is started by that screen read. Nothing attaches to it. A later screen-mode stop sends it SIGTERM (`stopVncCommand` in `packages/core/src/node/desktop-runtime.ts`). That matches a control transport that starts, loses the watch client, and exits on signal 15 with no control upgrade.

## Decision

Port #3948. Do not invent a second switch path.

*   A new proxied screen for the same bot loads in a new iframe. The iframe it replaces stays mounted, inert, and hidden from assistive technology until the new one reports past loading, or 15 seconds pass, or an error shows.
*   Only the live iframe's window is listened to. The retiring watch page's `disconnected` cannot clear the control page.
*   Release shows the bot's last watch address immediately when that capability has more than a minute left. The watch address is the one issued as `view`. It is not rewritten into a control capability. If release fails, the control address is put back.
*   Mobile keeps its own screen view.

View and control stay different capabilities. The watch link is never made writable.

## Test

One web unit test, on the hook the panel draws:

1. Watch screen connects.
2. The next read is the control address (takeover).
3. The watch iframe reports `disconnected` (upstream close).
4. There is no screen error. The control iframe is still mounted. It then reports `connected`.
5. Release shows the watch address again. A close from the control iframe does not error that watch screen.

## Not tested

No browser pass against a live computer. The socket upgrade itself is the proxy and noVNC; this change only keeps the control document mounted so that upgrade can start.
