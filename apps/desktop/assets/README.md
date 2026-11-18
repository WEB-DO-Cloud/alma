# Desktop icons

`brand/alma-icon.svg` is the square spark: a white star on `#002D62`.
`brand/alma-icon-macos.png` is the macOS icon: an 824px `#002D62` squircle
centered on a 1024px canvas, so the padding is 100px, with the same white star
and a soft drop shadow. macOS draws that file as-is.

`icon-macos.png` is that PNG, the Dock icon for unpackaged launches.
`icon.icns` is the same artwork at the standard sizes from 16 through 512@2x.
`icon.png` is the Linux icon and `icon.ico` is the Windows icon. Those two
stay full-bleed squares, and Linux and Windows apply their own mask. The star
on the square sits 8 points below the phone spark, 82 pixels (8% of 1024)
higher than the previous installed Mac icon. Phone icons are unchanged.

Run `pnpm --filter @rakazo/ui-tokens export:brand` to refresh these files.
The export copies `brand/alma-icon-macos.png` into `icon-macos.png` and
`icon.icns`, and rebuilds the Linux and Windows icons from the square spark.

`background.png` (660×400) and `background@2x.png` (1320×800) are the DMG
window: plain white, with the arrow in `#002D62`. Finder draws "ALMA" and
"Applications" in its own label color on that white field.

`packages/ui-tokens/assets/Rakazo.icon` still holds the unshifted spark. Its
fill is `#002D62` and its group translation matches the rasters above.
Packaging uses `assets/icon.icns` rather than compiling that bundle.
