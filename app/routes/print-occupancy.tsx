import { getPrimaryBuilding } from "@db/repositories/export.server";
import { listUnits, summarize } from "@db/repositories/units.server";
import { PrintLayout } from "~/components/print-layout";
import { requireOrg } from "~/lib/auth.server";
import { approximateAge, formatJa, todayInTokyo } from "~/lib/date";
import type { Route } from "./+types/print-occupancy";

export function meta(_: Route.MetaArgs) {
  return [{ title: "入居状況一覧 | 家主の帳面" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { ctx } = await requireOrg(request);
  const today = todayInTokyo();
  const [items, building] = await Promise.all([
    listUnits(ctx, { asOf: today }),
    getPrimaryBuilding(ctx),
  ]);
  return { items, summary: summarize(items), building, today };
}

export default function PrintOccupancy({ loaderData }: Route.ComponentProps) {
  const { items, summary, building, today } = loaderData;

  return (
    <PrintLayout title="入居状況一覧" building={building} today={today}>
      <p className="mb-3 text-base tabular-nums">
        部屋 {summary.rooms.total}室（空室 {summary.rooms.vacant}） ／ 駐車場{" "}
        {summary.parking.total}台（空室 {summary.parking.vacant}）
      </p>

      <table className="w-full border-collapse text-base">
        <thead>
          <tr className="border-b-2 border-slate-800 text-left">
            <th className="py-1 pr-2">部屋</th>
            <th className="py-1 pr-2">入居者</th>
            <th className="py-1 pr-2 text-right">年齢</th>
            <th className="py-1 pr-2 text-right">家賃</th>
            <th className="py-1 pr-2">次回更新</th>
            <th className="py-1">状態</th>
          </tr>
        </thead>
        <tbody>
          {items.map((u) => {
            const age = approximateAge(u.tenantBirthYear, today);
            return (
              <tr key={u.id} className="border-b border-slate-300">
                <td className="py-1 pr-2 font-bold tabular-nums">{u.code}</td>
                <td className="py-1 pr-2">{u.tenantName ?? "—"}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{age ?? "—"}</td>
                <td className="py-1 pr-2 text-right tabular-nums">
                  {u.rent != null ? u.rent.toLocaleString("ja-JP") : "—"}
                </td>
                <td className="py-1 pr-2 tabular-nums">
                  {u.isVacant ? "—" : formatJa(u.nextRenewalDate) || "—"}
                </td>
                <td className="py-1">{u.isVacant ? "空室" : "入居中"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </PrintLayout>
  );
}
