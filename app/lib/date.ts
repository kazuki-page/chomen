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

/**
 * Nか月後の日付。更新手続きを「予定日の何か月前から出すか」の判定に使う。
 * 文字列のまま計算するのでタイムゾーンによるずれが起きない。
 * 加算先に存在しない日（1/31の1か月後など）はその月の末日に丸める。
 */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const [y, m, d] = date.split("-").map(Number);
  const total = (y * 12 + (m - 1)) + months;
  const targetYear = Math.floor(total / 12);
  const targetMonth = (total % 12) + 1;
  const day = Math.min(d, daysInMonth(targetYear, targetMonth));
  return format(targetYear, targetMonth, day);
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

/**
 * 生年からおおよその年齢を出す。
 *
 * 誕生日を保持していないため、単純に「今年 − 生年」で計算する。
 * 誕生日前の人は1歳多く出るが、入居者の年齢構成をざっくり把握する用途なので許容する。
 */
export function approximateAge(
  birthYear: number | null | undefined,
  asOf: IsoDate,
): number | null {
  if (!birthYear) return null;
  const age = Number(asOf.slice(0, 4)) - birthYear;
  return age >= 0 && age < 130 ? age : null;
}

/** 高齢者とみなす年齢。入居者の年齢構成の把握に使う */
export const SENIOR_AGE = 65;

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
