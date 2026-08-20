/**
 * OG画像の SVG を組み立てて標準出力に書く。
 *
 *   node scripts/make-og.mjs demo > og-demo.svg
 *   node scripts/make-og.mjs app  > og-app.svg
 *
 * PNG への変換は scripts/make-og.sh が行う（macOS 依存のため分けている）。
 *
 * 2種類ある理由:
 *   demo … 公開して見てもらうためのもの。技術スタックとURLを載せる
 *   app  … 家族が本番のURLを送り合ったときに出るもの。宣伝文句は要らない
 */
const NAVY = "#003156";
const LIGHT = "#e8f1ff";
const AMBER = "#FFB94D";

/** 氏名は絶対に載せない。部屋番号と金額・空室状態だけで構成する */
const ROOMS = [
  ["101", "68,000円"], ["102", "70,000円"], ["103", "72,000円"],
  ["104", "74,000円"], ["105", null],       ["106", "76,000円"],
  ["107", "78,000円"], ["108", "68,000円"], ["109", "70,000円"],
  ["110", "72,000円"], ["P1", "8,000円"],   ["P2", "8,000円"],
];

function panel(px, py) {
  const out = [
    `<rect x="${px}" y="${py}" width="520" height="490" rx="20" fill="#ffffff"/>`,
    `<text x="${px + 24}" y="${py + 46}" font-size="26" font-weight="700" fill="#0f172a">部屋・駐車場</text>`,
    `<line x1="${px + 24}" y1="${py + 64}" x2="${px + 496}" y2="${py + 64}" stroke="#e2e8f0" stroke-width="2"/>`,
  ];
  const [cw, ch, gx, gy] = [148, 84, 18, 14];
  ROOMS.forEach(([code, rent], i) => {
    const cx = px + 20 + (i % 3) * (cw + gx);
    const cy = py + 82 + Math.floor(i / 3) * (ch + gy);
    const vacant = rent === null;
    out.push(
      `<rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" rx="12" fill="${vacant ? "#fff7ea" : "#ffffff"}" stroke="${vacant ? "#ffcb7e" : "#e2e8f0"}" stroke-width="2"/>`,
      `<text x="${cx + 16}" y="${cy + 37}" font-size="27" font-weight="700" fill="#0f172a">${code}</text>`,
      vacant
        ? `<text x="${cx + 16}" y="${cy + 64}" font-size="19" font-weight="700" fill="#9a5c00">空室・募集中</text>`
        : `<text x="${cx + 16}" y="${cy + 64}" font-size="19" fill="#64748b">${rent}</text>`,
    );
  });
  return out.join("\n  ");
}

/** アプリアイコンと同じ図柄。scripts/make-icons.mjs と形を合わせること */
const mark = (x, y) => `<g transform="translate(${x},${y})">
    <path d="M50 22 L80 45 L80 76 L20 76 L20 45 Z" fill="${LIGHT}"/>
    <g fill="${NAVY}">
      <rect x="28" y="53" width="9" height="9" rx="1.4"/><rect x="45.5" y="53" width="9" height="9" rx="1.4"/><rect x="63" y="53" width="9" height="9" rx="1.4"/>
      <rect x="28" y="64.5" width="9" height="9" rx="1.4"/><rect x="63" y="64.5" width="9" height="9" rx="1.4"/>
    </g>
    <rect x="45.5" y="64.5" width="9" height="9" rx="1.4" fill="${AMBER}"/>
  </g>`;

const TAGLINE = "賃貸物件の入居者・修繕管理アプリ";

/** demo は下に2行入るぶん、左の塊を上寄せにする */
function left(variant) {
  if (variant === "demo") {
    return `${mark(80, 84)}
  <text x="80" y="268" font-size="78" font-weight="700" fill="#ffffff">家主の帳面</text>
  <text x="80" y="322" font-size="27" fill="#a7c6e8">${TAGLINE}</text>
  <line x1="80" y1="418" x2="500" y2="418" stroke="#6fa1d0" stroke-width="2" opacity="0.45"/>
  <text x="80" y="470" font-size="20" fill="#6fa1d0">React Router v8 / Cloudflare Workers / D1</text>
  <text x="80" y="506" font-size="20" fill="#6fa1d0">chomen-demo.kazuki.page</text>`;
  }
  // app は名前だけなので、縦の中央に置く
  return `${mark(80, 180)}
  <text x="80" y="384" font-size="78" font-weight="700" fill="#ffffff">家主の帳面</text>
  <text x="80" y="430" font-size="27" fill="#a7c6e8">${TAGLINE}</text>`;
}

/*
 * キャンバスを 1200x1200 の正方形にして、1200x630 を上下中央に置く。
 * 変換に使う qlmanage が正方形に収める挙動のため、
 * 非正方形のまま渡すと拡大されて切り出し位置が読めなくなる。
 * 上端から 285px の帯を切り出すと目的の画像になる（make-og.sh）。
 */
const variant = process.argv[2] === "app" ? "app" : "demo";

process.stdout.write(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
<rect width="1200" height="1200" fill="${NAVY}"/>
<g transform="translate(0,285)" font-family="Hiragino Sans">
  <rect width="1200" height="630" fill="${NAVY}"/>
  ${left(variant)}
  ${panel(620, 70)}
</g>
</svg>
`);
