import { getEquipmentMatrix } from "@db/repositories/equipment.server";
import { getPrimaryBuilding } from "@db/repositories/export.server";
import { PrintLayout } from "~/components/print-layout";
import { requireOrg } from "~/lib/auth.server";
import { EQUIPMENT_CATEGORIES, matrixKey } from "~/lib/constants";
import { todayInTokyo } from "~/lib/date";
import type { Route } from "./+types/print-equipment";

export function meta(_: Route.MetaArgs) {
  return [{ title: "設備一覧 | おおやさん" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { ctx } = await requireOrg(request);
  const [matrix, building] = await Promise.all([
    getEquipmentMatrix(ctx),
    getPrimaryBuilding(ctx),
  ]);
  return {
    units: matrix.units,
    latest: Array.from(matrix.latest.entries()),
    building,
    today: todayInTokyo(),
  };
}

export default function PrintEquipment({ loaderData }: Route.ComponentProps) {
  const { units, latest, building, today } = loaderData;
  const map = new Map(latest);

  return (
    <PrintLayout title="設備一覧（前回の交換・実施）" building={building} today={today}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-slate-800 text-left">
            <th className="py-1 pr-2">部屋</th>
            {EQUIPMENT_CATEGORIES.map((c) => (
              <th key={c.value} className="py-1 pr-2">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {units.map((unit) => (
            <tr key={unit.id} className="border-b border-slate-300">
              <td className="py-1 pr-2 font-bold tabular-nums">{unit.code}</td>
              {EQUIPMENT_CATEGORIES.map((c) => {
                const record = map.get(matrixKey(unit.id, c.value));
                return (
                  <td key={c.value} className="py-1 pr-2 align-top tabular-nums">
                    {record ? (
                      <>
                        <span className="block whitespace-nowrap">
                          {record.performedOn.replaceAll("-", "/")}
                        </span>
                        {record.modelNumber && (
                          <span className="block text-xs text-slate-600">
                            {record.modelNumber}
                          </span>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </PrintLayout>
  );
}
