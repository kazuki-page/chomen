/**
 * アプリアイコンを生成する。
 * 画像ツールが入っていない環境でも動くよう、ラスタライズも PNG 出力も自前で行う。
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const BG = [15, 23, 42]; // slate-900（選択中のタブと同じ色）
const FG = [255, 255, 255];

/** 4倍で描いてから縮小し、輪郭を滑らかにする */
const SS = 4;

function inTriangle(x, y, [ax, ay], [bx, by], [cx, cy]) {
  const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  const a = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / d;
  const b = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / d;
  return a >= 0 && b >= 0 && a + b <= 1;
}

const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

/** 0..1 の座標系で家を描く。中央 6 割に収めてマスク（丸く切られる形）に耐えるようにする */
function isHouse(u, v) {
  const roof = inTriangle(u, v, [0.5, 0.26], [0.19, 0.52], [0.81, 0.52]);
  const body = inRect(u, v, 0.28, 0.5, 0.72, 0.76);
  if (!roof && !body) return false;
  // ドアをくり抜く
  if (inRect(u, v, 0.44, 0.58, 0.56, 0.76)) return false;
  return true;
}

function render(size) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS) / size;
          const v = (y + (sy + 0.5) / SS) / size;
          if (isHouse(u, v)) hits++;
        }
      }
      const alpha = hits / (SS * SS);
      const i = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) {
        rgba[i + c] = Math.round(BG[c] + (FG[c] - BG[c]) * alpha);
      }
      rgba[i + 3] = 255;
    }
  }
  return rgba;
}

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  // 各行の先頭にフィルタ種別(0)を置く
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const out = process.argv[2];
for (const [name, size] of [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["apple-touch-icon.png", 180],
]) {
  const file = `${out}/${name}`;
  writeFileSync(file, png(size, render(size)));
  console.log("書き出し", file, size);
}
