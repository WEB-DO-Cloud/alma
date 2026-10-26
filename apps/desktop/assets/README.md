# Desktop icons

The shared editable source and export notes are in
[`packages/ui-tokens/assets`](../../../packages/ui-tokens/assets/README.md).

Mac packaging requires Xcode 26 or newer. Electron builder compiles `Rakazo.icon`
into `Assets.car` for Tahoe and generates `icon.icns` for older macOS versions.
This tree does not recompile that bundle. `icon-macos.png` is the development
export of the ALMA icon.

`icon.png` and `icon.ico` are the Linux and Windows icons: a white spark on
`#002D62`. Refresh them with `pnpm --filter @rakazo/ui-tokens export:brand`.
