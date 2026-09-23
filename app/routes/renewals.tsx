import { Link } from "react-router";
import { listRenewals } from "@db/repositories/renewals.server";
import { requireOrg } from "~/lib/auth.server";
import { formatJa } from "~/lib/date";
import { formatRentIncreases } from "~/lib/renewals";
import type { Route } from "./+types/renewals";

export function meta() { return [{ title: "更新 | 家主の帳面" }]; }

export async function loader({ request }: Route.LoaderArgs) {
  const { ctx } = await requireOrg(request);
  return { items: await listRenewals(ctx) };
}

export default function Renewals({ loaderData: { items } }: Route.ComponentProps) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-6 pb-16">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">更新 <span className="text-lg">{items.length}件</span></h1>
        <Link to="/print/renewals" className="rounded-xl border border-sky-700 px-4 py-3 text-lg font-bold text-sky-800">印刷・PDF</Link>
      </div>
      <p className="mt-3 text-base text-slate-600">これから行う更新を、更新日の早い順に表示しています。</p>
      <p className="mt-1 text-base text-slate-600">家賃と値上げ履歴は、その契約の更新日前の確定した記録です。</p>
      {items.length === 0 ? <p className="mt-6 rounded-xl bg-white p-5 text-lg">これから行う更新はありません。</p> : (
        <ul className="mt-5 space-y-4">
          {items.map((item) => (
            <li key={item.procedureId} className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-lg font-bold text-sky-800">更新日：{item.renewalDate ? formatJa(item.renewalDate) : "未定"}</p>
              <h2 className="mt-2 break-words text-xl font-bold">{item.unitCode} · {item.tenantName}</h2>
              <dl className="mt-4 space-y-3 text-lg">
                <div><dt className="text-base text-slate-600">更新前の家賃</dt><dd>{item.rentBefore === null ? "不明" : `${item.rentBefore.toLocaleString("ja-JP")}円`}</dd></div>
                <div><dt className="text-base text-slate-600">過去の値上げ履歴</dt><dd className="break-words">{formatRentIncreases(item.increases) || (item.rentBefore === null ? "確認できる記録なし" : "値上げの記録なし")}</dd></div>
              </dl>
              <Link to={`/procedures/${item.procedureId}`} className="mt-4 inline-flex min-h-12 items-center rounded-lg bg-sky-700 px-4 py-3 text-lg font-bold text-white">更新手続きを開く</Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
