/**
 * Placeholder ALMA mark. Final store art is still pending.
 * Colors follow the dark token background (#141414) and white foreground.
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const assets = join(dirname(fileURLToPath(import.meta.url)), "..", "assets");

function png(width, height, pixel) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const color = pixel(x, y, width, height);
      const at = row + 1 + x * 4;
      raw[at] = color[0];
      raw[at + 1] = color[1];
      raw[at + 2] = color[2];
      raw[at + 3] = color[3];
    }
  }
  const idat = deflateSync(raw);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const crc = crc32(Buffer.concat([head.subarray(4), data]));
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc >>> 0, 0);
  return Buffer.concat([head, data, tail]);
}

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return ~crc;
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / length));
  const x = x1 + t * dx;
  const y = y1 + t * dy;
  return Math.hypot(px - x, py - y);
}

function mark(x, y, size) {
  const s = size;
  const strokes = [
    [0.3 * s, 0.78 * s, 0.5 * s, 0.22 * s],
    [0.5 * s, 0.22 * s, 0.7 * s, 0.78 * s],
    [0.38 * s, 0.56 * s, 0.62 * s, 0.56 * s],
  ];
  const thickness = s * 0.045;
  return strokes.some(([x1, y1, x2, y2]) => distToSegment(x, y, x1, y1, x2, y2) <= thickness);
}

function filled(background) {
  return (x, y, width) => {
    const pad = width * 0.08;
    const size = width - pad * 2;
    if (mark(x - pad, y - pad, size)) return [255, 255, 255, 255];
    return background;
  };
}

writeFileSync(join(assets, "icon.png"), png(1024, 1024, filled([20, 20, 20, 255])));
writeFileSync(join(assets, "adaptive-icon.png"), png(1024, 1024, filled([0, 0, 0, 0])));
writeFileSync(join(assets, "monochrome-icon.png"), png(1024, 1024, filled([0, 0, 0, 0])));
writeFileSync(
  join(assets, "icon-background.png"),
  png(1024, 1024, () => [20, 20, 20, 255]),
);
writeFileSync(join(assets, "splash-icon.png"), png(1024, 1024, filled([0, 0, 0, 0])));
writeFileSync(join(assets, "favicon.png"), png(64, 64, filled([20, 20, 20, 255])));
writeFileSync(
  join(assets, "notification-icon.png"),
  png(96, 96, (x, y, width) => (mark(x, y, width) ? [255, 255, 255, 255] : [0, 0, 0, 0])),
);
console.log("wrote ALMA placeholder icons");
