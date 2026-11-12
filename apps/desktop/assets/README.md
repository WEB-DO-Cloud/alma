# Desktop icons

The shared spark is `brand/alma-icon.svg`: a white star on `#002D62`.
Run `pnpm --filter @rakazo/ui-tokens export:brand` to refresh these files.

`icon.icns` is the macOS app icon. `icon.png` is the Linux icon and
`icon.ico` is the Windows icon. `icon-macos.png` is the Dock icon for
unpackaged launches. All four are the same full-bleed square. macOS, Windows,
and Linux apply their own rounded mask, and the star keeps the phone icon's
padding. It sits 49 points below the phone spark. The installed Mac icon was
90 points below that spark, so this is 41 pixels (4% of 1024) higher. The
phone icons are unchanged.

`background.png` (660×400) and `background@2x.png` (1320×800) are the DMG
window: a gradient between shades of `#002D62`, a white arrow, and light
plates behind the Finder labels. Finder draws "ALMA" and "Applications"
itself. electron-builder cannot set that label color, so the plates keep the
light-appearance labels readable.

`packages/ui-tokens/assets/Rakazo.icon` still holds the unshifted spark. Its
fill is `#002D62` and its group translation matches the rasters above.
Packaging uses `assets/icon.icns` rather than compiling that bundle.
