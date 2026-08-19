/**
 * アプリアイコンを生成する。
 * 画像ツールが入っていない環境でも動くよう、ラスタライズも PNG/ICO 出力も自前で行う。
 *
 *   node scripts/make-icons.mjs public
 *
 * 図柄は「窓のある家」。窓のうち1つだけが黄色く、これが空室にあたる。
 * 空室を保存せず導出するというこのアプリの中心概念を、そのまま絵にしている。
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

/** ブランド色。app/app.css の @theme と揃えること */
const NAVY = [0x00, 0x31, 0x56];
const LIGHT = [0xe8, 0xf1, 0xff];
const AMBER = [0xff, 0xb9, 0x4d];

/** 4倍で描いてから縮小し、輪郭を滑らかにする */
const SS = 4;

const inTriangle = (x, y, [ax, ay], [bx, by], [cx, cy]) => {
  const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  const a = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / d;
  const b = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / d;
  return a >= 0 && b >= 0 && a + b <= 1;
};

const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

/** 角を丸めた矩形。窓のような小さい図形でも角が立たないようにする */
function inRoundRect(x, y, x0, y0, w, h, r) {
  const x1 = x0 + w;
  const y1 = y0 + h;
  if (!inRect(x, y, x0, y0, x1, y1)) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

/*
 * 座標は 0..1。
 * Android の maskable アイコンは円形に切られることがあるため、
 * 図柄を中心から半径 0.4 の円の内側に収めている。
 */
const ROOF = [
  [0.5, 0.22],
  [0.2, 0.45],
  [0.8, 0.45],
];
const BODY = [0.2, 0.45, 0.8, 0.76];

const WIN = 0.09;
const WIN_R = 0.014;
const COLS = [0.28, 0.455, 0.63];
const ROWS = [0.53, 0.645];
/** 空室にする窓（下段の中央） */
const VACANT = [0.455, 0.645];

function colorAt(u, v) {
  for (const cx of COLS) {
    for (const cy of ROWS) {
      if (!inRoundRect(u, v, cx, cy, WIN, WIN, WIN_R)) continue;
      return cx === VACANT[0] && cy === VACANT[1] ? AMBER : NAVY;
    }
  }
  const house =
    inTriangle(u, v, ROOF[0], ROOF[1], ROOF[2]) ||
    inRect(u, v, BODY[0], BODY[1], BODY[2], BODY[3]);
  return house ? LIGHT : NAVY;
}

function render(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const n = SS * SS;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = colorAt((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size);
          r += c[0];
          g += c[1];
          b += c[2];
        }
      }
      const i = (y * size + x) * 4;
      rgba[i] = Math.round(r / n);
      rgba[i + 1] = Math.round(g / n);
      rgba[i + 2] = Math.round(b / n);
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

/**
 * ICO は PNG をそのまま格納できる（Windows Vista 以降・主要ブラウザすべて対応）。
 * BMP に変換する必要はない。
 */
function ico(sizes) {
  const images = sizes.map((s) => png(s, render(s)));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // 予約
  header.writeUInt16LE(1, 2); // 1 = アイコン
  header.writeUInt16LE(sizes.length, 4);

  let offset = 6 + sizes.length * 16;
  const entries = sizes.map((s, i) => {
    const e = Buffer.alloc(16);
    e[0] = s >= 256 ? 0 : s; // 0 は 256 を意味する
    e[1] = s >= 256 ? 0 : s;
    e[2] = 0; // パレット数
    e[3] = 0; // 予約
    e.writeUInt16LE(1, 4); // プレーン数
    e.writeUInt16LE(32, 6); // ビット深度
    e.writeUInt32LE(images[i].length, 8);
    e.writeUInt32LE(offset, 12);
    offset += images[i].length;
    return e;
  });

  return Buffer.concat([header, ...entries, ...images]);
}

const out = process.argv[2] ?? "public";

for (const [name, size] of [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["apple-touch-icon.png", 180],
]) {
  writeFileSync(`${out}/${name}`, png(size, render(size)));
  console.log("書き出し", `${out}/${name}`, size);
}

writeFileSync(`${out}/favicon.ico`, ico([16, 32, 48]));
console.log("書き出し", `${out}/favicon.ico`, "16/32/48");
