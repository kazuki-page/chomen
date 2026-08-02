/**
 * 部屋番号・駐車場番号の生成。
 *
 * 画面（プレビュー）とサーバー（登録処理）の双方から使うため、
 * 副作用のない純粋な関数として `app/lib` に置く。
 */

/** 一度に作れる上限。打ち間違いで大量生成する事故を防ぐ */
export const MAX_UNITS_PER_BATCH = 300;

export type FloorPattern = {
  /** 開始階 */
  fromFloor: number;
  /** 終了階 */
  toFloor: number;
  /** 各階の部屋数 */
  roomsPerFloor: number;
  /** 各階の開始番号。通常は 1（→ 101, 102, ...） */
  startNumber: number;
  /** 部屋番号部分の桁数。通常は 2（→ 101）、10部屋以上でも 2 で足りる */
  pad: number;
};

export const DEFAULT_FLOOR_PATTERN: FloorPattern = {
  fromFloor: 1,
  toFloor: 4,
  roomsPerFloor: 10,
  startNumber: 1,
  pad: 2,
};

/** 「1〜4階 各10室」から 101, 102, ... 410 を作る */
export function generateFloorCodes(p: FloorPattern): string[] {
  const codes: string[] = [];
  if (p.toFloor < p.fromFloor || p.roomsPerFloor < 1) return codes;

  for (let floor = p.fromFloor; floor <= p.toFloor; floor++) {
    for (let i = 0; i < p.roomsPerFloor; i++) {
      const n = p.startNumber + i;
      codes.push(`${floor}${String(n).padStart(p.pad, "0")}`);
      if (codes.length >= MAX_UNITS_PER_BATCH) return codes;
    }
  }
  return codes;
}

/** 「P1 〜 P5」のような連番を作る */
export function generateSequentialCodes(prefix: string, from: number, to: number): string[] {
  const codes: string[] = [];
  if (to < from) return codes;
  for (let n = from; n <= to; n++) {
    codes.push(`${prefix}${n}`);
    if (codes.length >= MAX_UNITS_PER_BATCH) break;
  }
  return codes;
}

/**
 * 番号を直接指定する場合の解析。
 * 改行・カンマ・空白・読点のどれで区切っても受け付ける。
 * 号室が不規則な建物のために用意している。
 */
export function parseCodeList(text: string): string[] {
  const seen = new Set<string>();
  const codes: string[] = [];

  for (const raw of text.split(/[\s,、]+/)) {
    const code = raw.trim();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    codes.push(code);
    if (codes.length >= MAX_UNITS_PER_BATCH) break;
  }
  return codes;
}
