import { readFileSync } from "node:fs";
import path from "node:path";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

const assets = path.resolve(import.meta.dirname, "../assets");
const mobileIcon = path.resolve(import.meta.dirname, "../../mobile/assets/icon.png");
const iconJson = path.resolve(
  import.meta.dirname,
  "../../../packages/ui-tokens/assets/Rakazo.icon/icon.json",
);

/** Previous Icon Composer shift was 90 points down. The desktop star is 4% of 1024 higher. */
const DESKTOP_SHIFT_DOWN = 90 - Math.round(1024 * 0.04);

type Raster = { width: number; height: number; pixels: Buffer };

function paeth(left: number, up: number, upLeft: number) {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const diagonal = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= diagonal) return left;
  return upDistance <= diagonal ? up : upLeft;
}

function decodePng(buffer: Buffer): Raster {
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat: Buffer[] = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9] ?? 0;
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
  }
  const channels = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(width * height * 4);
  let source = 0;
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[source] ?? 0;
    source += 1;
    const row = raw.subarray(source, source + stride);
    source += stride;
    const recon = Buffer.alloc(stride);
    for (let index = 0; index < stride; index += 1) {
      const left = index >= channels ? (recon[index - channels] ?? 0) : 0;
      const up = previous[index] ?? 0;
      const upLeft = index >= channels ? (previous[index - channels] ?? 0) : 0;
      const byte = row[index] ?? 0;
      if (filter === 0) recon[index] = byte;
      else if (filter === 1) recon[index] = (byte + left) & 255;
      else if (filter === 2) recon[index] = (byte + up) & 255;
      else if (filter === 3) recon[index] = (byte + Math.floor((left + up) / 2)) & 255;
      else recon[index] = (byte + paeth(left, up, upLeft)) & 255;
    }
    for (let x = 0; x < width; x += 1) {
      const from = x * channels;
      const to = (y * width + x) * 4;
      pixels[to] = recon[from] ?? 0;
      pixels[to + 1] = recon[from + 1] ?? 0;
      pixels[to + 2] = recon[from + 2] ?? 0;
      pixels[to + 3] = channels === 4 ? (recon[from + 3] ?? 0) : 255;
    }
    previous = recon;
  }
  return { width, height, pixels };
}

function readPng(file: string) {
  return decodePng(readFileSync(file));
}

function pixel(image: Raster, x: number, y: number) {
  const index = (y * image.width + x) * 4;
  return [image.pixels[index], image.pixels[index + 1], image.pixels[index + 2]] as const;
}

function whiteCentroid(image: Raster) {
  let count = 0;
  let xSum = 0;
  let ySum = 0;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const [red, green, blue] = pixel(image, x, y);
      if ((red ?? 0) > 200 && (green ?? 0) > 200 && (blue ?? 0) > 200) {
        count += 1;
        xSum += x;
        ySum += y;
      }
    }
  }
  return { count, x: xSum / count, y: ySum / count };
}

function pngsInIcns(file: Buffer) {
  const images: Raster[] = [];
  let offset = 8;
  while (offset + 8 <= file.length) {
    const length = file.readUInt32BE(offset + 4);
    const data = file.subarray(offset + 8, offset + length);
    const signature = data.indexOf(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (signature >= 0) images.push(decodePng(data.subarray(signature)));
    offset += length;
  }
  return images;
}

describe("desktop install artwork", () => {
  const packageJson = JSON.parse(readFileSync(path.resolve(assets, "../package.json"), "utf8")) as {
    build: {
      mac: { icon: string };
      dmg: { background: string; window: { width: number; height: number } };
      win: { icon: string };
      linux: { icon: string };
    };
  };

  it("points packaging at the blue icns and the DMG background", () => {
    expect(packageJson.build.mac.icon).toBe("assets/icon.icns");
    expect(packageJson.build.win.icon).toBe("assets/icon.ico");
    expect(packageJson.build.linux.icon).toBe("assets/icon.png");
    expect(packageJson.build.dmg.background).toBe("background.png");
    expect(packageJson.build.dmg.window).toEqual({ width: 660, height: 400 });
  });

  it("lifts only the desktop star and keeps the ALMA blue plate", () => {
    const desktop = readPng(path.join(assets, "icon.png"));
    const dock = readPng(path.join(assets, "icon-macos.png"));
    const phone = readPng(mobileIcon);
    expect(desktop).toEqual(dock);
    expect(pixel(desktop, 0, 0)).toEqual([0, 45, 98]);
    expect(pixel(phone, 0, 0)).toEqual([0, 45, 98]);
    const desktopMark = whiteCentroid(desktop);
    const phoneMark = whiteCentroid(phone);
    expect(desktopMark.count).toBe(phoneMark.count);
    expect(desktopMark.x).toBeCloseTo(phoneMark.x, 4);
    expect(desktopMark.y - phoneMark.y).toBeCloseTo(DESKTOP_SHIFT_DOWN, 4);
    const composer = JSON.parse(readFileSync(iconJson, "utf8")) as {
      fill: { solid: string };
      groups: Array<{
        position: { "translation-in-points": number[] };
        translucency: { enabled: boolean };
      }>;
    };
    expect(composer.fill.solid).toBe("extended-srgb:0.00000,0.17647,0.38431,1.00000");
    expect(composer.groups[0]?.position["translation-in-points"]).toEqual([0, DESKTOP_SHIFT_DOWN]);
    expect(composer.groups[0]?.translucency.enabled).toBe(false);
  });

  it("embeds the same 1024 plate in the macOS and Windows icon files", () => {
    const desktop = readPng(path.join(assets, "icon.png"));
    const icns = readFileSync(path.join(assets, "icon.icns"));
    expect(icns.subarray(0, 4).toString("ascii")).toBe("icns");
    const largest = pngsInIcns(icns).find((image) => image.width === 1024);
    expect(largest?.pixels.equals(desktop.pixels)).toBe(true);
    const ico = readFileSync(path.join(assets, "icon.ico"));
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBeGreaterThanOrEqual(6);
  });

  it("paints the DMG window as an ALMA blue gradient with a light arrow and label plates", () => {
    const background = readPng(path.join(assets, "background.png"));
    const retina = readPng(path.join(assets, "background@2x.png"));
    expect(background.width).toBe(660);
    expect(background.height).toBe(400);
    expect(retina.width).toBe(1320);
    expect(retina.height).toBe(800);
    const top = pixel(background, 20, 0);
    const field = pixel(background, 20, 168);
    const bottom = pixel(background, 20, 399);
    for (const sample of [top, field, bottom]) {
      expect(sample[2]).toBeGreaterThan(sample[0] ?? 0);
      expect(sample[0]).toBeLessThan(80);
    }
    expect(Math.abs((field[1] ?? 0) - 45)).toBeLessThan(8);
    expect(Math.abs((field[2] ?? 0) - 98)).toBeLessThan(12);
    expect((top[1] ?? 0) > (field[1] ?? 0)).toBe(true);
    expect((bottom[1] ?? 0) < (field[1] ?? 0)).toBe(true);
    expect(pixel(background, 329, 175).every((channel) => (channel ?? 0) > 250)).toBe(true);
    expect(pixel(retina, 658, 350).every((channel) => (channel ?? 0) > 250)).toBe(true);
    for (const [x, y] of [
      [170, 242],
      [490, 242],
    ] as const) {
      const plate = pixel(background, x, y);
      expect(plate[0]).toBeGreaterThan(230);
      expect(plate[1]).toBeGreaterThan(230);
      expect(plate[2]).toBeGreaterThan(230);
    }
  });
});
