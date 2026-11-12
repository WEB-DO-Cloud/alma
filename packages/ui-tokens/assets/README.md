# App icon source

`Rakazo.icon` is the macOS Icon Composer bundle. The directory name stays. The
foreground image is the white ALMA spark on a transparent field, and `icon.json`
fills the plate with `#002D62`. Packaging uses `apps/desktop/assets/icon.icns`
instead of compiling this bundle. Open it in Icon Composer with Xcode 26 or
newer to recompile it. This tree does not recompile the bundle.

`brand/alma-icon.svg` is the square icon: a white spark on `#002D62`.
`brand/alma-logo.svg` is the navy wordmark. `brand/alma-logo-white.svg` is the
same wordmark in white, used for the splash image and the social card.

Run `pnpm --filter @rakazo/ui-tokens export:brand` to refresh the web and
marketing favicons, the marketing mark, the Windows and Linux icons, the phone
icon, the splash image, and `apps/www/public/og-image.png`.

- `apps/desktop/assets/icon.png`, `icon-macos.png`, `icon.ico`, and `icon.icns`:
  the same 1024-pixel white spark on `#002D62`, 8 pixels below the phone
  icon and 82 pixels higher than the installed desktop icon. Phone icons are
  not shifted. The files are full-bleed squares; each OS applies its own mask.
- `apps/mobile/assets/icon.png`: opaque 1024-pixel square for the generic/legacy icon,
  with no rounded mask or Dock margins.
- `apps/mobile/assets/adaptive-icon.png`: transparent 1024-pixel Android foreground;
  the bot is 820 pixels wide, centered horizontally and offset 179 pixels from the top.
  Its face stays inside the launcher's safe area and the body extends below the mask.
- `apps/mobile/assets/icon-background.png`: opaque Android background using the
  shared dark background token.
- `apps/mobile/assets/monochrome-icon.png`: matching Android alpha silhouette with
  transparent eyes for themed launchers.

Refresh platform exports after changing the source. Android supplies its own mask;
never bake Mac corners, a rim, or an outer shadow into adaptive layers.

Run `pnpm --filter @rakazo/ui-tokens export:brand` to refresh the web and marketing
favicons, install icons, marketing mark, Windows/Linux icons, mobile splash, and
mobile web favicon. These use the same orange foreground with the shared dark
background, a rounded mask for small browser marks, and transparent splash padding.
The notification export uses the Android monochrome silhouette so its eyes remain
transparent. Apple Icon Composer and Android launcher exports remain separate
because their system masks and safe areas differ.

After exporting, run `pnpm exec tsx apps/www/scripts/render-og.mjs` to refresh the
marketing page social cards; set `CHROME_PATH` to a headless Chrome executable when
it is not available at the script's default location.

## Animated vector avatars

The animated Rakazo avatar uses SVG paths and gradients in the shared
`logo-avatar-art.ts` definition. Its contour is sampled from this canonical
source's alpha silhouette. The hands and lighting are simplified vector shapes;
the original photographic skin grain is intentionally not reproduced. No raster
body is embedded or loaded by the vector renderer. The canonical icon and its
platform exports remain unchanged.
