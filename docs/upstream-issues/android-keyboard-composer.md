# Android Chrome hides the chat composer behind the keyboard

Draft for [elie222/rakazo](https://github.com/elie222/rakazo/issues/new). Not filed.

Compared with upstream `main` at [`65510dc6893e37a6fb1070fe87e32315af3b6709`](https://github.com/elie222/rakazo/commit/65510dc6893e37a6fb1070fe87e32315af3b6709). The layout below matches that commit. ALMA's overlay does not change it: `apps/web/src/styles.css` is identical, and the viewport meta differs only by the product name and icon size.

## Title

Android Chrome hides the chat composer behind the on-screen keyboard

## Body

### Environment

- Phone, Chrome for Android 108 or newer (the URL bar is visible, so this is the browser, not a WebView).
- A signed-in chat, composer focused, on-screen keyboard open.
- Reproduced on a deployment whose web shell matches Rakazo `main` at `65510dc`.

### Steps

1. Open a chat on a phone in Chrome for Android.
2. Tap the message field so the on-screen keyboard opens.

### Expected

The message field stays fully visible above the keyboard. The transcript uses the space that remains.

### Actual

The message field sits behind the keyboard. Only its top edge stays visible above the keys.

### Cause

Chrome 108 changed Android's default to `interactive-widget=resizes-visual`. The keyboard shrinks the visual viewport and leaves the layout viewport at the full screen height. Viewport units stay the same. `position: fixed` elements anchored to the layout viewport stay put and can sit under the keyboard. A block that is `height: 100%` of that layout viewport does the same.

The viewport meta does not opt back into the older resize:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

[`apps/web/index.html` line 5](https://github.com/elie222/rakazo/blob/65510dc6893e37a6fb1070fe87e32315af3b6709/apps/web/index.html#L5)

`html`, `body`, and `#root` are `height: 100%`, so they take that full layout viewport. `#root` only adds the safe-area padding, which is the home indicator, not the keyboard.

[`apps/web/src/styles.css` lines 7-24](https://github.com/elie222/rakazo/blob/65510dc6893e37a6fb1070fe87e32315af3b6709/apps/web/src/styles.css#L7-L24)

The shell fills that height and clips overflow:

[`apps/web/src/pages/Shell.tsx` line 882](https://github.com/elie222/rakazo/blob/65510dc6893e37a6fb1070fe87e32315af3b6709/apps/web/src/pages/Shell.tsx#L882)

The chat column is a flex column ([line 971](https://github.com/elie222/rakazo/blob/65510dc6893e37a6fb1070fe87e32315af3b6709/apps/web/src/pages/Shell.tsx#L971)). The transcript takes the slack (`min-h-0 flex-1`). The composer is the next in-flow sibling, not `position: fixed` ([lines 1074-1082](https://github.com/elie222/rakazo/blob/65510dc6893e37a6fb1070fe87e32315af3b6709/apps/web/src/pages/Shell.tsx#L1074-L1082)).

[`apps/web/src/pages/shell/composer.tsx` lines 591-597](https://github.com/elie222/rakazo/blob/65510dc6893e37a6fb1070fe87e32315af3b6709/apps/web/src/pages/shell/composer.tsx#L591-L597)

When the keyboard opens, the layout viewport stays full height, the shell stays full height, and the composer stays at the bottom of it, in the region the keyboard covers. `overflow: hidden` on the shell means the page cannot scroll the field into view, so only a sliver shows. `100dvh` would not move it either: with `resizes-visual`, Chrome keeps viewport units stable while the keyboard is open.

The chat shell does not read `visualViewport`. The computer screen does, and that path is separate:

[`apps/web/src/pages/shell/use-computer.tsx` lines 312-328](https://github.com/elie222/rakazo/blob/65510dc6893e37a6fb1070fe87e32315af3b6709/apps/web/src/pages/shell/use-computer.tsx#L312-L328)

[`apps/web/src/pages/shell/computer-overlay.tsx` lines 77-84](https://github.com/elie222/rakazo/blob/65510dc6893e37a6fb1070fe87e32315af3b6709/apps/web/src/pages/shell/computer-overlay.tsx#L77-L84)

WebKit still ignores `interactive-widget`, so this does not by itself change Safari on iOS. Chrome's Android WebView was also left out of the Chrome 108 default change.

### Proposed fix

Ask Chrome to shrink the layout viewport with the keyboard. `height: 100%` then shrinks, the transcript gives up the space, and the in-flow composer sits above the keys. Desktop has no on-screen keyboard, so its layout does not change. The computer overlay already follows `visualViewport`, which shrinks together with the layout viewport in this mode.

```diff
--- a/apps/web/index.html
+++ b/apps/web/index.html
@@ -2,7 +2,7 @@
 <html lang="en">
   <head>
     <meta charset="UTF-8" />
-    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
+    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, interactive-widget=resizes-content" />
     <meta name="description" content="Your team of always-on agents." />
```
