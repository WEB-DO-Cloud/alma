# App icon source

`Rakazo.icon` is the macOS Icon Composer bundle. The directory name stays. The
foreground image is the white ALMA spark. Open the bundle in Icon Composer with
Xcode 26 or newer to recompile it. This tree does not recompile the bundle.

`brand/alma-icon.svg` is the square icon: a white spark on `#002D62`.
`brand/alma-logo.svg` is the navy wordmark. `brand/alma-logo-white.svg` is the
same wordmark in white, used for the splash image and the social card.

Run `pnpm --filter @rakazo/ui-tokens export:brand` to refresh the web and
marketing favicons, the marketing mark, the Windows and Linux icons, the phone
icon, the splash image, and `apps/www/public/og-image.png`.

The phone splash background is `#002D62` in `apps/mobile/app.json`. Android
adaptive icons use a transparent white spark over a flat `#002D62` background.
Do not bake a mask, a rim, or a shadow into those layers.
