import { Link } from "react-router";

import { formatJa } from "~/lib/date";

/**
 * 印刷用ページの共通枠。
 *
 * PDF はサーバーで生成しない。Workers 上で日本語 PDF を作るには
 * CJK フォント（5〜15MB）の埋め込みが必要で、Worker のサイズ上限を超えてしまう。
 * 印刷用の HTML を用意すれば、ブラウザの印刷から「PDFとして保存」でPDFになり、
 * 日本語のフォントは端末のものがそのまま使われる。
 *
 * 操作ボタンは `print:hidden` で印刷時に消える。
 */
export function PrintLayout({
  title,
  building,
  today,
  children,
}: {
  title: string;
  building: { name: string; address: string | null };
  today: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-5xl px-4 py-6 print:max-w-none print:px-0 print:py-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link to="/export" className="text-slate-500 hover:underline">
          ← 書き出し
        </Link>
        <PrintButton />
      </div>

      <header className="mt-4 border-b-2 border-slate-800 pb-2 print:mt-0">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-1 flex flex-wrap gap-x-4 text-base text-slate-600">
          <span>{building.name}</span>
          {building.address && <span>{building.address}</span>}
          <span className="ml-auto tabular-nums">{formatJa(today)} 現在</span>
        </p>
      </header>

      <div className="mt-4">{children}</div>
    </main>
  );
}

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-xl bg-sky-600 px-5 py-3 text-lg font-bold text-white hover:bg-sky-700"
    >
      印刷する
    </button>
  );
}
