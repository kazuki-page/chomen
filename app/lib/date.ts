/**
 * 日付ユーティリティ。
 *
 * 本アプリの日付は `YYYY-MM-DD` の文字列で扱う（database/schema/_shared.ts 参照）。
 * Worker は UTC で動くため、「今日」は必ず日本時間で判定する。
 */

export type IsoDate = string;

const TIME_ZONE = "Asia/Tokyo";

/** 日本時間での「今日」を YYYY-MM-DD で返す */
export function todayInTokyo(now: Date = new Date()): IsoDate {
  // en-CA ロケールは YYYY-MM-DD 形式で出力される
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(now);
}

/**
 * 契約更新日の算出に使う「N年後の同日」。
 *
 * 文字列のまま年だけ加算する。Date を経由しないため、
 * タイムゾーンによる1日ずれが起きない。
 * 2月29日のように加算先に存在しない日付は、その月の末日に丸める。
 */
export function addYears(date: IsoDate, years: number): IsoDate {
  const [y, m, d] = date.split("-").map(Number);
  const targetYear = y + years;
  const lastDay = daysInMonth(targetYear, m);
  const day = Math.min(d, lastDay);
  return format(targetYear, m, day);
}

/** 2つの日付の差を日数で返す（a - b） */
export function diffInDays(a: IsoDate, b: IsoDate): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
}

/** 指定日が属する月の範囲を返す（両端を含む） */
export function monthRange(date: IsoDate): { from: IsoDate; to: IsoDate } {
  const [y, m] = date.split("-").map(Number);
  const last = daysInMonth(y, m);
  return { from: format(y, m, 1), to: format(y, m, last) };
}

/** N日前の日付。放置判定の閾値に使う */
export function subtractDays(date: IsoDate, days: number): IsoDate {
  const t = Date.parse(`${date}T00:00:00Z`) - days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** 「2026年8月1日」形式で表示する */
export function formatJa(date: IsoDate | null | undefined): string {
  if (!date) return "";
  const [y, m, d] = date.split("-").map(Number);
  return `${y}年${m}月${d}日`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function format(year: number, month: number, day: number): IsoDate {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
