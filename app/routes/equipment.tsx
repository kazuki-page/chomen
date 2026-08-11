import { Link } from "react-router";

import { getEquipmentMatrix } from "@db/repositories/equipment.server";
import { requireOrg } from "~/lib/auth.server";
import { EQUIPMENT_CATEGORIES, matrixKey } from "~/lib/constants";
import { todayInTokyo } from "~/lib/date";
import type { Route } from "./+types/equipment";

export function meta(_: Route.MetaArgs) {
  return [{ title: "設備 | 家主の帳面" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { ctx } = await requireOrg(request);
  const matrix = await getEquipmentMatrix(ctx);

  // Map は loader の戻り値として運べないので配列に直す
  return {
    units: matrix.units,
    latest: Array.from(matrix.latest.entries()),
    today: todayInTokyo(),
    imported: Number(new URL(request.url).searchParams.get("imported")) || 0,
  };
}

export default function Equipment({ loaderData }: Route.ComponentProps) {
  const { units, latest, today, imported } = loaderData;
  const map = new Map(latest);
  const thisYear = Number(today.slice(0, 4));

  if (units.length === 0) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="text-2xl font-bold">設備</h1>
        <p className="mt-6 rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-slate-500">
          先に部屋を登録してください
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 pb-16">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">設備</h1>
        <div className="flex shrink-0 gap-2">
          <Link
            to="/equipment/import"
            className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-base font-medium hover:bg-slate-100"
          >
            一括登録
          </Link>
          <Link
            to="/equipment/new"
            className="rounded-xl bg-sky-600 px-4 py-3 text-base font-bold text-white hover:bg-sky-700"
          >
            ＋ 記録
          </Link>
        </div>
      </div>

      {imported > 0 && (
        <p className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-base text-emerald-900">
          {imported}件の設備記録を登録しました
        </p>
      )}

      <p className="mt-2 text-base text-slate-600">
        各部屋の<strong>前回の交換・実施</strong>を表示しています。
        セルを押すと記録の追加と履歴の確認ができます。
      </p>

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full border-collapse text-base">
          <thead>
            <tr className="bg-slate-50 text-left text-sm text-slate-600">
              <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2">部屋</th>
              {EQUIPMENT_CATEGORIES.map((c) => (
                <th key={c.value} className="px-3 py-2 whitespace-nowrap">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {units.map((unit) => (
              <tr key={unit.id}>
                <th className="sticky left-0 z-10 bg-white px-3 py-2 text-left text-lg font-bold tabular-nums">
                  {unit.code}
                </th>
                {EQUIPMENT_CATEGORIES.map((c) => {
                  const record = map.get(matrixKey(unit.id, c.value));
                  return (
                    <td key={c.value} className="px-1 py-1 align-top">
                      <Link
                        to={`/equipment/new?unitId=${unit.id}&category=${c.value}`}
                        className={`block rounded-lg px-2 py-2 hover:bg-slate-100 ${
                          record ? "" : "text-slate-300"
                        }`}
                      >
                        {record ? (
                          <Cell performedOn={record.performedOn} thisYear={thisYear} />
                        ) : (
                          <span className="text-base">＋</span>
                        )}
                      </Link>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-sm text-slate-500">
        年数の色：<span className="font-medium text-slate-700">5年未満</span> ／{" "}
        <span className="font-medium text-amber-700">5〜10年</span> ／{" "}
        <span className="font-medium text-rose-700">10年以上</span>
      </p>
    </main>
  );
}

/**
 * 一覧は「いつやったか」を並べて見るための画面なので、日付と経過年数だけを出す。
 * 型番は行が伸びて一覧性が落ちるため出さない。
 * セルを押せば履歴（型番つき）が見られるので、情報は辿れる。
 */
function Cell({ performedOn, thisYear }: { performedOn: string; thisYear: number }) {
  const years = thisYear - Number(performedOn.slice(0, 4));
  const tone =
    years >= 10 ? "text-rose-700" : years >= 5 ? "text-amber-700" : "text-slate-700";

  return (
    <span className={`block whitespace-nowrap font-medium tabular-nums ${tone}`}>
      {performedOn.slice(0, 7).replace("-", "/")}
      <span className="ml-1 text-sm">（{years}年）</span>
    </span>
  );
}
