import { listRenewals } from "@db/repositories/renewals.server";
import { getPrimaryBuilding } from "@db/repositories/export.server";
import { PrintLayout } from "~/components/print-layout";
import { requireOrg } from "~/lib/auth.server";
import { formatJa, todayInTokyo } from "~/lib/date";
import { formatRentIncreases } from "~/lib/renewals";
import type { Route } from "./+types/print-renewals";

export function meta() { return [{ title: "更新一覧 | 家主の帳面" }]; }
export async function loader({ request }: Route.LoaderArgs) {
  const { ctx } = await requireOrg(request);
  const [items, building] = await Promise.all([listRenewals(ctx), getPrimaryBuilding(ctx)]);
  return { items, building, today: todayInTokyo() };
}
export default function PrintRenewals({ loaderData: { items, building, today } }: Route.ComponentProps) {
  return <PrintLayout title="更新一覧" building={building} today={today}>
    <p className="mb-3 text-base">未完了の更新 {items.length}件 · 更新日順。家賃・値上げ履歴は同じ契約の更新日前の確定記録。</p>
    {items.length === 0 ? <p>これから行う更新はありません。</p> : (
      <div className="overflow-x-auto print:overflow-visible">
        <table className="w-full border-collapse text-base">
          <thead><tr className="border-b-2 border-slate-800">{["更新日", "部屋", "名前", "更新前の家賃", "過去の値上げ履歴"].map((label) => <th key={label} scope="col" className="p-2 text-left">{label}</th>)}</tr></thead>
          <tbody>{items.map((item) => <tr key={item.procedureId} className="break-inside-avoid border-b border-slate-300">
            <td className="whitespace-nowrap p-2 align-top">{item.renewalDate ? formatJa(item.renewalDate) : "未定"}</td>
            <td className="p-2 align-top">{item.unitCode}</td><td className="p-2 align-top">{item.tenantName}</td>
            <td className="whitespace-nowrap p-2 align-top">{item.rentBefore === null ? "不明" : `${item.rentBefore.toLocaleString("ja-JP")}円`}</td>
            <td className="p-2 align-top">{formatRentIncreases(item.increases) || (item.rentBefore === null ? "確認できる記録なし" : "値上げの記録なし")}</td>
          </tr>)}</tbody>
        </table>
      </div>
    )}
  </PrintLayout>;
}
