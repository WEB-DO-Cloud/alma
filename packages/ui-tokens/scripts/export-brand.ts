import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = new URL("../../../", import.meta.url);
const path = (name: string) => fileURLToPath(new URL(name, root));
const NAVY = "#002D62";

const iconSvg = await readFile(path("brand/alma-icon.svg"));
const sparkSvg = Buffer.from(
  iconSvg.toString("utf8").replace(/\s*<rect id="plate"[^>]*\/>\s*/, "\n"),
);
const wordSvg = await readFile(path("brand/alma-logo-white.svg"));
const wordBlackSvg = Buffer.from(
  (await readFile(path("brand/alma-logo.svg"), "utf8")).replaceAll("#002D62", "#000000"),
);
const faviconSvg = await readFile(path("apps/web/public/favicon.svg"));

async function pngFile(input: Buffer, name: string, width: number, height = width) {
  await sharp(input).resize(width, height).png().toFile(path(name));
}

async function ico(input: Buffer, name: string, sizes: number[]) {
  const frames = await Promise.all(
    sizes.map((size) => sharp(input).resize(size, size).png().toBuffer()),
  );
  const header = Buffer.alloc(6 + frames.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);
  let offset = header.length;
  frames.forEach((frame, index) => {
    const entry = 6 + index * 16;
    const size = sizes[index] ?? 0;
    header[entry] = header[entry + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(frame.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += frame.length;
  });
  await writeFile(path(name), Buffer.concat([header, ...frames]));
}

/** PNG-backed icns sizes. The OS applies the rounded-square mask. */
const ICNS_TYPES: ReadonlyArray<readonly [string, number]> = [
  ["icp4", 16],
  ["icp5", 32],
  ["icp6", 64],
  ["ic07", 128],
  ["ic08", 256],
  ["ic09", 512],
  ["ic10", 1024],
  ["ic11", 32],
  ["ic12", 64],
  ["ic13", 256],
  ["ic14", 512],
];

async function icns(input: Buffer, name: string) {
  const chunks: Buffer[] = [];
  for (const [type, size] of ICNS_TYPES) {
    const png = size === ICON ? input : await sharp(input).resize(size, size).png().toBuffer();
    const header = Buffer.alloc(8);
    header.write(type, 0, "ascii");
    header.writeUInt32BE(png.length + 8, 4);
    chunks.push(header, png);
  }
  const body = Buffer.concat(chunks);
  const fileHeader = Buffer.alloc(8);
  fileHeader.write("icns", 0, "ascii");
  fileHeader.writeUInt32BE(body.length + 8, 4);
  await writeFile(path(name), Buffer.concat([fileHeader, body]));
}

/** Biome keeps short primitive arrays on one line. JSON.stringify does not. */
function formatIconJson(value: unknown) {
  return JSON.stringify(value, null, 2).replace(
    /\[(\n(?:[ \t]+(?:-?\d+(?:\.\d+)?|"(?:[^"\\]|\\.)*"),?\n)+)[ \t]*\]/g,
    (match) => {
      const items = [...match.matchAll(/-?\d+(?:\.\d+)?|"(?:[^"\\]|\\.)*"/g)].map(
        (found) => found[0],
      );
      return `[${items.join(", ")}]`;
    },
  );
}

function extendedSrgb(hex: string) {
  const component = (start: number) =>
    (Number.parseInt(hex.slice(start, start + 2), 16) / 255).toFixed(5);
  return `extended-srgb:${component(1)},${component(3)},${component(5)},1.00000`;
}

const ICON = 1024;
/**
 * The Icon Composer group used to translate the spark 90 points down (positive
 * Y is down), which is the low star in the current DMG. Lift that by 8% of
 * the icon height. Phone icons stay on the unshifted spark.
 */
const PREVIOUS_DESKTOP_SHIFT_DOWN = 90;
const DESKTOP_STAR_LIFT = Math.round(ICON * 0.08);
const DESKTOP_SHIFT_DOWN = PREVIOUS_DESKTOP_SHIFT_DOWN - DESKTOP_STAR_LIFT;

async function desktopIcon(sparkImage: Buffer) {
  const cropped = await sharp(sparkImage)
    .extract({ left: 0, top: 0, width: ICON, height: ICON - DESKTOP_SHIFT_DOWN })
    .png()
    .toBuffer();
  return sharp({
    create: { width: ICON, height: ICON, channels: 3, background: NAVY },
  })
    .composite([{ input: cropped, left: 0, top: DESKTOP_SHIFT_DOWN }])
    .png()
    .toBuffer();
}

const DMG_WIDTH = 660;
const DMG_HEIGHT = 400;

function dmgBackgroundSvg(scale: number) {
  const width = DMG_WIDTH * scale;
  const height = DMG_HEIGHT * scale;
  const px = (value: number) => (value * scale).toFixed(2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#FFFFFF"/>
  <g fill="none" stroke="${NAVY}" stroke-width="${px(2.75)}" stroke-linecap="round" stroke-linejoin="round">
    <path d="M${px(296)} ${px(175)} H${px(348)}"/>
    <path d="M${px(336)} ${px(165)} L${px(360)} ${px(175)} L${px(336)} ${px(185)}"/>
  </g>
</svg>`;
}

const plate = await sharp(iconSvg).resize(1024, 1024).png().toBuffer();
const spark = await sharp(sparkSvg).resize(1024, 1024).png().toBuffer();

for (const app of ["web", "www"]) {
  const publicDir = `apps/${app}/public`;
  await writeFile(path(`${publicDir}/favicon.svg`), faviconSvg);
  await pngFile(plate, `${publicDir}/favicon-16x16.png`, 16);
  await pngFile(plate, `${publicDir}/favicon-32x32.png`, 32);
  await pngFile(plate, `${publicDir}/favicon.png`, 32);
  await pngFile(plate, `${publicDir}/apple-touch-icon.png`, 180);
  await pngFile(plate, `${publicDir}/icon-192.png`, 192);
  await pngFile(plate, `${publicDir}/icon-512.png`, 512);
  await ico(plate, `${publicDir}/favicon.ico`, [16, 32, 48]);
}

await mkdir(path("apps/www/public/brand"), { recursive: true });
await pngFile(plate, "apps/www/public/brand/alma-mark.png", 256);
await rm(path("apps/www/public/brand/rakazo-mark.png"), { force: true });

await pngFile(plate, "apps/mobile/assets/icon.png", 1024);
await pngFile(spark, "apps/mobile/assets/adaptive-icon.png", 1024);
await pngFile(spark, "apps/mobile/assets/monochrome-icon.png", 1024);
await sharp({ create: { width: 1024, height: 1024, channels: 3, background: NAVY } })
  .png()
  .toFile(path("apps/mobile/assets/icon-background.png"));
await pngFile(spark, "apps/mobile/assets/notification-icon.png", 72);
await pngFile(plate, "apps/mobile/assets/favicon.png", 128);
await pngFile(spark, "packages/ui-tokens/assets/Rakazo.icon/Assets/orange-bot.png", 1024);

const wordWidth = 720;
const wordHeight = Math.round((wordWidth * 67) / 259);
const word = await sharp(wordSvg).resize(wordWidth, wordHeight).png().toBuffer();
// Tight crop. A square with padding makes contain draw the wordmark far smaller than imageWidth.
const splashWordWidth = 2048;
await sharp(
  await sharp(wordSvg)
    .resize(splashWordWidth, Math.round((splashWordWidth * 67) / 259))
    .png()
    .toBuffer(),
)
  .trim({ threshold: 1 })
  .png()
  .toFile(path("apps/mobile/assets/splash-icon.png"));
// Android 12 draws this inside a circle. The wordmark is wider than that circle, so the spark fills it.
const sparkTrimmed = await sharp(spark).trim({ threshold: 1 }).png().toBuffer();
const sparkMeta = await sharp(sparkTrimmed).metadata();
const sparkSide = Math.max(sparkMeta.width ?? 1, sparkMeta.height ?? 1);
await sharp({
  create: {
    width: sparkSide,
    height: sparkSide,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite([
    {
      input: sparkTrimmed,
      left: Math.round((sparkSide - (sparkMeta.width ?? sparkSide)) / 2),
      top: Math.round((sparkSide - (sparkMeta.height ?? sparkSide)) / 2),
    },
  ])
  .png()
  .toFile(path("apps/mobile/assets/splash-icon-android.png"));
const blackWordWidth = 2048;
await sharp(
  await sharp(wordBlackSvg)
    .resize(blackWordWidth, Math.round((blackWordWidth * 67) / 259))
    .png()
    .toBuffer(),
)
  .trim({ threshold: 1 })
  .png()
  .toFile(path("apps/mobile/assets/alma-logo-black.png"));
await writeFile(path("apps/web/public/alma-logo-black.svg"), wordBlackSvg);
await sharp({ create: { width: 1200, height: 630, channels: 3, background: NAVY } })
  .composite([
    {
      input: word,
      left: Math.round((1200 - wordWidth) / 2),
      top: Math.round((630 - wordHeight) / 2),
    },
  ])
  .png()
  .toFile(path("apps/www/public/og-image.png"));

const desktop = await desktopIcon(spark);
await sharp(desktop).toFile(path("apps/desktop/assets/icon.png"));
await sharp(desktop).toFile(path("apps/desktop/assets/icon-macos.png"));
await ico(desktop, "apps/desktop/assets/icon.ico", [16, 32, 48, 64, 128, 256]);
await icns(desktop, "apps/desktop/assets/icon.icns");
await sharp(Buffer.from(dmgBackgroundSvg(1)))
  .png()
  .toFile(path("apps/desktop/assets/background.png"));
await sharp(Buffer.from(dmgBackgroundSvg(2)))
  .png()
  .toFile(path("apps/desktop/assets/background@2x.png"));

const navyFill = { solid: extendedSrgb(NAVY) };
await writeFile(
  path("packages/ui-tokens/assets/Rakazo.icon/icon.json"),
  `${formatIconJson({
    fill: navyFill,
    "fill-specializations": [
      { value: navyFill },
      { appearance: "dark", value: navyFill },
      { appearance: "tinted", value: navyFill },
    ],
    groups: [
      {
        layers: [
          {
            glass: false,
            "image-name": "orange-bot.png",
            name: "orange-bot",
          },
        ],
        position: {
          scale: 1,
          "translation-in-points": [0, DESKTOP_SHIFT_DOWN],
        },
        shadow: { kind: "none", opacity: 0 },
        translucency: { enabled: false, value: 0 },
      },
    ],
    "supported-platforms": {
      circles: ["watchOS"],
      squares: "shared",
    },
  })}\n`,
);
