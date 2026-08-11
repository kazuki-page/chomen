import { getLedger, getPrimaryBuilding } from "@db/repositories/export.server";
import { PrintButton } from "~/components/print-layout";
import { requireOrg } from "~/lib/auth.server";
import {
  EQUIPMENT_CATEGORIES,
  WORK_ORDER_STATUS_LABELS,
  type WorkOrderStatus,
} from "~/lib/constants";
import { Link } from "react-router";

import { approximateAge, formatJa, todayInTokyo } from "~/lib/date";
import type { Route } from "./+types/print-ledger";

export function meta(_: Route.MetaArgs) {
  return [{ title: "部屋台帳 | 家主の帳面" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { ctx } = await requireOrg(request);
  const today = todayInTokyo();
  const [ledger, building] = await Promise.all([
    getLedger(ctx, { asOf: today }),
    getPrimaryBuilding(ctx),
  ]);
  return { ledger, building, today };
}

/**
 * 部屋台帳。1部屋につき1ページで印刷される。
 * 紙で保管する前提の主役の帳票なので、その部屋の情報を1枚に集約する。
 */
export default function PrintLedger({ loaderData }: Route.ComponentProps) {
  const { ledger, building, today } = loaderData;

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 print:max-w-none print:px-0 print:py-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link to="/export" className="text-slate-500 hover:underline">
          ← 書き出し
        </Link>
        <p className="text-base text-slate-600">全 {ledger.length} 枚</p>
        <PrintButton />
      </div>

      {ledger.map((unit) => (
        <section
          key={unit.id}
          // 1部屋ごとに改ページする。最後の1枚で改ページすると白紙が出るので除く
          className="mt-8 break-after-page first:mt-4 last:break-after-auto print:mt-0"
        >
          <header className="border-b-2 border-slate-800 pb-2">
            <div className="flex items-baseline gap-3">
              <h1 className="text-3xl font-bold tabular-nums">{unit.code}</h1>
              <span className="text-base">{unit.isVacant ? "空室" : "入居中"}</span>
              <span className="ml-auto text-sm text-slate-600 tabular-nums">
                {formatJa(today)} 現在
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {building.name}
              {building.address && ` ／ ${building.address}`}
            </p>
          </header>

          <Block title="契約">
            {unit.isVacant ? (
              <p className="text-base">
                空室
                {unit.listingRent != null &&
                  `（募集家賃 ${unit.listingRent.toLocaleString("ja-JP")}円）`}
              </p>
            ) : (
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-base">
                <Field label="入居者" value={unit.tenantName ?? "—"} />
                <Field
                  label="年齢"
                  value={(() => {
                    const age = approximateAge(unit.tenantBirthYear, today);
                    return age !== null ? `およそ ${age}歳` : "—";
                  })()}
                />
                <Field
                  label="家賃"
                  value={unit.rent != null ? `${unit.rent.toLocaleString("ja-JP")}円` : "—"}
                />
                <Field label="契約日" value={formatJa(unit.contractDate) || "—"} />
                <Field label="次回更新" value={formatJa(unit.nextRenewalDate) || "—"} />
              </dl>
            )}
          </Block>

          <Block title="入居の履歴">
            <Rows
              rows={unit.history.map((h) => [
                `${formatJa(h.contractDate)} 〜 ${h.endedOn ? formatJa(h.endedOn) : "現在"}`,
                h.tenantName,
              ])}
              empty="履歴はありません"
            />
          </Block>

          <Block title="設備（前回の交換・実施）">
            <Rows
              rows={EQUIPMENT_CATEGORIES.map((c) => {
                const latest = unit.equipment.find((e) => e.category === c.value);
                return [
                  c.label,
                  latest
                    ? `${formatJa(latest.performedOn)}${latest.modelNumber ? ` ／ ${latest.modelNumber}` : ""}`
                    : "記録なし",
                ];
              })}
              empty="記録はありません"
            />
          </Block>

          <Block title="修繕の履歴">
            <Rows
              rows={unit.workOrders.map((w) => [
                formatJa(w.occurredOn),
                `${w.title}（${WORK_ORDER_STATUS_LABELS[w.status as WorkOrderStatus] ?? w.status}${
                  w.cost != null ? ` ／ ${w.cost.toLocaleString("ja-JP")}円` : ""
                }）`,
              ])}
              empty="記録はありません"
            />
          </Block>

          <Block title="手続き">
            <Rows
              rows={unit.procedures.map((p) => [
                formatJa(p.scheduledOn) || "—",
                `${labelForProcedure(p.type)}（${p.status === "done" ? "完了" : "進行中"}）`,
              ])}
              empty="記録はありません"
            />
          </Block>
        </section>
      ))}
    </main>
  );
}

function labelForProcedure(type: string): string {
  return { move_in: "入居手続き", renewal: "更新手続き", move_out: "退居手続き" }[type] ?? type;
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 break-inside-avoid">
      <h2 className="border-b border-slate-400 pb-0.5 text-base font-bold">{title}</h2>
      <div className="mt-1.5">{children}</div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-slate-600">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function Rows({ rows, empty }: { rows: string[][]; empty: string }) {
  if (rows.length === 0) return <p className="text-base text-slate-500">{empty}</p>;
  return (
    <table className="w-full border-collapse text-base">
      <tbody>
        {rows.map((cells, i) => (
          <tr key={i} className="border-b border-slate-200">
            <td className="w-56 py-0.5 pr-3 align-top tabular-nums">{cells[0]}</td>
            <td className="py-0.5 align-top">{cells[1]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
