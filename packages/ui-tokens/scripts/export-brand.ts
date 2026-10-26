import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = new URL("../../../", import.meta.url);
const path = (name: string) => fileURLToPath(new URL(name, root));
const NAVY = "#002D62";

const iconSvg = await readFile(path("brand/alma-icon.svg"));
const sparkSvg = Buffer.from(iconSvg.toString("utf8").replace(/\s*<rect id="plate"[^>]*\/>\s*/, "\n"));
const wordSvg = await readFile(path("brand/alma-logo-white.svg"));
const faviconSvg = await readFile(path("apps/web/public/favicon.svg"));

async function pngFile(input: Buffer, name: string, width: number, height = width) {
  await sharp(input).resize(width, height).png().toFile(path(name));
}

async function ico(input: Buffer, name: string, sizes: number[]) {
  const frames = await Promise.all(sizes.map((size) => sharp(input).resize(size, size).png().toBuffer()));
  const header = Buffer.alloc(6 + frames.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);
  let offset = header.length;
  frames.forEach((frame, index) => {
    const entry = 6 + index * 16;
    header[entry] = header[entry + 1] = sizes[index] === 256 ? 0 : sizes[index];
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(frame.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += frame.length;
  });
  await writeFile(path(name), Buffer.concat([header, ...frames]));
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
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: word, left: Math.round((1024 - wordWidth) / 2), top: Math.round((1024 - wordHeight) / 2) }])
  .png()
  .toFile(path("apps/mobile/assets/splash-icon.png"));
await sharp({ create: { width: 1200, height: 630, channels: 3, background: NAVY } })
  .composite([{ input: word, left: Math.round((1200 - wordWidth) / 2), top: Math.round((630 - wordHeight) / 2) }])
  .png()
  .toFile(path("apps/www/public/og-image.png"));

await pngFile(plate, "apps/desktop/assets/icon.png", 1024);
await pngFile(plate, "apps/desktop/assets/icon-macos.png", 1024);
await ico(plate, "apps/desktop/assets/icon.ico", [16, 32, 48, 64, 128, 256]);
