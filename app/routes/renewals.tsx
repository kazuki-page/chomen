import { Link } from "react-router";
import { listRenewals } from "@db/repositories/renewals.server";
import { requireOrg } from "~/lib/auth.server";
import { formatSlash } from "~/lib/date";
import { formatRentIncreases } from "~/lib/renewals";
import type { Route } from "./+types/renewals";

export function meta() { return [{ title: "更新 | 家主の帳面" }]; }

export async function loader({ request }: Route.LoaderArgs) {
  const { ctx } = await requireOrg(request);
  return { items: await listRenewals(ctx) };
}

export default function Renewals({ loaderData: { items } }: Route.ComponentProps) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-6 pb-16">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">更新 <span className="text-lg">{items.length}件</span></h1>
        <Link to="/print/renewals" className="rounded-xl border border-sky-700 px-4 py-3 text-lg font-bold text-sky-800">印刷・PDF</Link>
      </div>
      <p className="mt-3 text-base text-slate-600">これから行う更新を、更新日の早い順に表示しています。</p>
      <p className="mt-1 text-base text-slate-600">家賃と値上げ履歴は、その契約の更新日前の確定した記録です。</p>
      {items.length === 0 ? <p className="mt-6 rounded-xl bg-white p-5 text-lg">これから行う更新はありません。</p> : (
        <>
          <p id="renewals-scroll-hint" className="mt-4 text-sm text-slate-600 md:hidden">表は左右にスクロールできます。部屋番号を押すと更新手続きが開きます。</p>
          <div
            role="region"
            aria-label="更新一覧"
            aria-describedby="renewals-scroll-hint"
            tabIndex={0}
            className="mt-3 overflow-auto rounded-xl border border-slate-300 bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
          >
            <table className="w-full min-w-[760px] border-collapse text-base">
              <caption className="sr-only">未完了の更新を更新日の早い順に表示</caption>
              <thead className="bg-sky-100 text-sky-900">
                <tr>
                  {['更新日', '部屋', '名前', '更新前の家賃', '過去の値上げ履歴'].map((label) => (
                    <th key={label} scope="col" className="whitespace-nowrap border-b border-slate-300 px-3 py-3 text-left font-bold">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.procedureId} className="border-b border-slate-200 last:border-0 even:bg-slate-50 hover:bg-sky-50">
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">{item.renewalDate ? formatSlash(item.renewalDate) : "未定"}</td>
                    <th scope="row" className="px-3 py-1 text-left">
                      <Link
                        to={`/procedures/${item.procedureId}`}
                        aria-label={`${item.unitCode}の更新手続きを開く`}
                        className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-lg px-2 text-lg font-bold text-sky-800 underline underline-offset-4 focus-visible:outline-2"
                      >{item.unitCode}</Link>
                    </th>
                    <td className="min-w-36 px-3 py-2">{item.tenantName}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-bold tabular-nums">{item.rentBefore === null ? "不明" : `${item.rentBefore.toLocaleString("ja-JP")}円`}</td>
                    <td className="min-w-64 px-3 py-2 leading-relaxed">{formatRentIncreases(item.increases) || (item.rentBefore === null ? "確認できる記録なし" : "値上げの記録なし")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
