// بيولّد أيقونات PNG بسيطة (من غير أي مكتبات): node scripts/gen-icons.mjs
import fs from "node:fs";
import zlib from "node:zlib";

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x + 0.5, y + 0.5, size);
      const i = y * (size * 4 + 1) + 1 + x * 4;
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; raw[i + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const clamp = (v) => Math.max(0, Math.min(1, v));

// دايرة ملونة وجواها "عين" بيضا (رمز راصد)
function eye(color) {
  const [r, g, b] = hex(color);
  return (x, y, s) => {
    const c = s / 2, d = Math.hypot(x - c, y - c);
    const outer = clamp(c - 0.5 - d + 0.5);
    const ring = clamp(d - s * 0.18 + 0.5) * clamp(s * 0.3 - d + 0.5);
    const dot = clamp(s * 0.1 - d + 0.5);
    const white = Math.max(ring, dot);
    return [Math.round(r + (255 - r) * white), Math.round(g + (255 - g) * white), Math.round(b + (255 - b) * white), Math.round(outer * 255)];
  };
}

// أيقونة البرنامج: مربع بحواف دايرية
function appIcon(x, y, s) {
  const [r, g, b] = hex("#0f766e");
  const rad = s * 0.22, m = s * 0.04;
  const qx = Math.max(Math.abs(x - s / 2) - (s / 2 - m - rad), 0);
  const qy = Math.max(Math.abs(y - s / 2) - (s / 2 - m - rad), 0);
  const inside = clamp(rad - Math.hypot(qx, qy) + 0.5);
  const c = s / 2, d = Math.hypot(x - c, y - c);
  const ring = clamp(d - s * 0.14 + 0.5) * clamp(s * 0.24 - d + 0.5);
  const dot = clamp(s * 0.075 - d + 0.5);
  const white = Math.max(ring, dot);
  return [Math.round(r + (255 - r) * white), Math.round(g + (255 - g) * white), Math.round(b + (255 - b) * white), Math.round(inside * 255)];
}

fs.writeFileSync("assets/tray-working.png", png(32, eye("#16a34a")));
fs.writeFileSync("assets/tray-break.png", png(32, eye("#d97706")));
fs.writeFileSync("assets/tray-off.png", png(32, eye("#94a3b8")));
fs.writeFileSync("assets/icon.png", png(512, appIcon));
console.log("icons written");
