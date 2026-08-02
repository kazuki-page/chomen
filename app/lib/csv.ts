/**
 * CSV の書き出し。
 *
 * Excel で開いたときに日本語が化けないよう、**先頭に BOM を付ける**。
 * これが無いと Windows の Excel が Shift_JIS と誤認する。
 */

const BOM = "﻿";

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return BOM + rows.map((row) => row.map(escapeCell).join(",")).join("\r\n") + "\r\n";
}

function escapeCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  // 区切り文字・引用符・改行を含む場合だけ引用する
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** ダウンロードとして返すレスポンスを作る */
export function csvResponse(filename: string, rows: (string | number | null | undefined)[][]) {
  return new Response(toCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      // 書き出しは常に最新を返す
      "cache-control": "no-store",
    },
  });
}
