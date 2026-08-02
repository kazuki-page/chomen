/**
 * 貼り付けられた表データの解析。
 *
 * ファイルアップロードではなく**貼り付け**にしているのは、
 * Excel や Notion からコピーするとタブ区切りで渡ってくるため、
 * 文字コード（Shift_JIS など）の判定を丸ごと回避できるから。
 * ブラウザが文字列として渡してくれるので、化けようがない。
 */

/** 区切り文字を自動判定する。タブがあればTSV、なければCSV */
export function detectDelimiter(text: string): "\t" | "," {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim() !== "") ?? "";
  return firstLine.includes("\t") ? "\t" : ",";
}

/**
 * CSV / TSV を行×列に分解する。
 * ダブルクォートで囲まれた値と、その中の `""` によるエスケープに対応する。
 */
export function parseTable(text: string, delimiter?: string): string[][] {
  const sep = delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field === "") {
      quoted = true;
    } else if (char === sep) {
      row.push(field.trim());
      field = "";
    } else if (char === "\n") {
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  row.push(field.trim());
  rows.push(row);

  // 完全に空の行は捨てる
  return rows.filter((r) => r.some((cell) => cell !== ""));
}

/** 1行目が見出しかどうかを判定する */
export function looksLikeHeader(row: string[], keywords: string[]): boolean {
  return row.some((cell) => keywords.some((k) => cell.includes(k)));
}

/**
 * 日付を `YYYY-MM-DD` に正規化する。
 * `2025/4/1` `2025-04-01` `2025.4.1` を受け付ける。
 */
export function normalizeDate(value: string): string | null {
  const m = value.trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (!m) return null;

  const [, y, mo, d] = m;
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** 「68,000」「68000円」などから数値を取り出す */
export function normalizeNumber(value: string): number | null {
  const cleaned = value.replace(/[,，\s円]/g, "").replace(/[０-９]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0),
  );
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
