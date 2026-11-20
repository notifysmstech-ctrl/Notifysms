import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) {
    c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xff];
  }
  return (c ^ -1) >>> 0;
}

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter none
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  const compressed = zlib.deflateSync(raw, {level: 9});
  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

function insideRoundedRect(x, y, rx, ry, rw, rh, rad) {
  if (x < rx || x >= rx + rw || y < ry || y >= ry + rh) return false;
  const cx = Math.min(Math.max(x, rx + rad), rx + rw - rad);
  const cy = Math.min(Math.max(y, ry + rad), ry + rh - rad);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= rad * rad;
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
}

function renderIcon(size, maskable = false) {
  const rgba = Buffer.alloc(size * size * 4);
  const s = size / 512;
  const padScale = maskable ? 0.72 : 1.0;
  const offset = (size * (1 - padScale)) / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 29, g = 78, b = 216, a = 255; // #1D4ED8

      if (!maskable) {
        if (!insideRoundedRect(x, y, 0, 0, size, size, 112 * s)) {
          a = 0;
        }
      }

      const ux = (x - offset) / (padScale * s);
      const uy = (y - offset) / (padScale * s);

      if (a > 0) {
        // White envelope card
        const inEnv = insideRoundedRect(ux, uy, 96, 144, 320, 212, 28);
        // Speech tail triangle
        const inTail = ux >= 148 && ux <= 204 && uy >= 354 && uy <= 402 && (ux - 148) <= (402 - uy) * 1.15;

        if (inEnv || inTail) {
          r = 255; g = 255; b = 255;
          // Chevron stroke inside envelope
          const d1 = distToSegment(ux, uy, 128, 178, 256, 272);
          const d2 = distToSegment(ux, uy, 256, 272, 384, 178);
          if (Math.min(d1, d2) <= 13) {
            r = 29; g = 78; b = 216;
          }
        }

        // Top relay bar pill
        if (insideRoundedRect(ux, uy, 292, 102, 124, 44, 22)) {
          r = 15; g = 23; b = 42;
          if (insideRoundedRect(ux, uy, 314, 118, 20, 12, 6) || insideRoundedRect(ux, uy, 344, 118, 20, 12, 6)) {
            r = 255; g = 255; b = 255;
          } else if (insideRoundedRect(ux, uy, 374, 118, 20, 12, 6)) {
            r = 96; g = 165; b = 250;
          }
        }
      }

      const idx = (y * size + x) * 4;
      rgba[idx] = r;
      rgba[idx + 1] = g;
      rgba[idx + 2] = b;
      rgba[idx + 3] = a;
    }
  }
  return encodePNG(size, size, rgba);
}

const outDir = path.resolve(process.cwd(), 'public');
fs.mkdirSync(outDir, {recursive: true});
fs.writeFileSync(path.join(outDir, 'pwa-192x192.png'), renderIcon(192, false));
fs.writeFileSync(path.join(outDir, 'pwa-512x512.png'), renderIcon(512, false));
fs.writeFileSync(path.join(outDir, 'pwa-maskable-512x512.png'), renderIcon(512, true));
fs.writeFileSync(path.join(outDir, 'apple-touch-icon.png'), renderIcon(180, true));
console.log('Generated PWA PNG icons in /public');
