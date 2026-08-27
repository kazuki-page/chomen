import { Link } from "react-router";

import { Badge, ListCard, Progress } from "~/components/list-card";

import {
  listLaterRenewals,
  listOpenProcedures,
  listProceduresInMonth,
  type ProcedureSummary,
} from "@db/repositories/procedures.server";
import { listUnits } from "@db/repositories/units.server";
import {
  listOpenWorkOrders,
  type WorkOrderListItem,
} from "@db/repositories/work-orders.server";
import { RENEWAL_LEAD_MONTHS, STALE_THRESHOLD_DAYS } from "~/lib/constants";
import { addMonths, formatJa, formatSlash, monthRange, todayInTokyo } from "~/lib/date";
import { requireOrg } from "~/lib/auth.server";
import type { Route } from "./+types/home";

export function meta(_: Route.MetaArgs) {
  return [{ title: "ホーム | 家主の帳面" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { ctx } = await requireOrg(request);
  const now = new Date();
  const asOf = todayInTokyo(now);

  // 更新手続きは予定日の RENEWAL_LEAD_MONTHS か月前から「やること」に出す
  const renewalUntil = addMonths(asOf, RENEWAL_LEAD_MONTHS);

  const [procedures, workOrders, units, thisMonth, laterRenewals] = await Promise.all([
    listOpenProcedures(ctx, { renewalUntil }),
    listOpenWorkOrders(ctx, { now }),
    listUnits(ctx, { asOf }),
    listProceduresInMonth(ctx, monthRange(asOf)),
    listLaterRenewals(ctx, { after: renewalUntil }),
  ]);

  return {
    procedures,
    workOrders,
    // 次の入居者が決まった部屋は外す。ここは募集の作業リストなので、
    // 残すと「募集家賃を入力」が対応の要らない部屋に出てしまう。
    // 入居手続き自体は「やること」に並ぶので、部屋が見えなくなるわけではない
    vacant: units.filter((u) => u.isVacant && u.upcomingTenantName === null),
    thisMonth,
    laterRenewals,
  };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { procedures, workOrders, vacant, thisMonth, laterRenewals } = loaderData;
  const todoCount = procedures.length + workOrders.length;
  const staleCount = workOrders.filter((w) => w.isStale).length;

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 pb-16">
      <h1 className="text-2xl font-bold">ホーム</h1>

      {staleCount > 0 && (
        <p className="mt-4 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-base font-medium text-rose-900">
          {staleCount}件の修繕が{STALE_THRESHOLD_DAYS}日以上動いていません
        </p>
      )}

      <Section title="やること" count={todoCount}>
        {todoCount === 0 ? (
          <Empty>今日やることはありません</Empty>
        ) : (
          <ul className="space-y-3">
            {procedures.map((p) => (
              <ProcedureRow key={p.id} procedure={p} />
            ))}
            {workOrders.map((w) => (
              <WorkOrderRow key={w.id} workOrder={w} />
            ))}
          </ul>
        )}
      </Section>

      {laterRenewals.length > 0 && (
        <details className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3">
          <summary className="cursor-pointer text-base font-medium text-slate-600">
            先の更新予定（{laterRenewals.length}件）
          </summary>
          <p className="mt-2 text-sm text-slate-500">
            予定日の{RENEWAL_LEAD_MONTHS}か月前になると「やること」に出ます。
          </p>
          <ul className="mt-2 divide-y divide-slate-200">
            {laterRenewals.map((r) => (
              <li key={r.id}>
                <Link
                  to={`/procedures/${r.id}`}
                  className="flex items-center gap-3 py-2 hover:bg-slate-50"
                >
                  <span className="w-28 shrink-0 text-slate-500 tabular-nums">
                    {formatJa(r.scheduledOn)}
                  </span>
                  <span className="font-bold tabular-nums">{r.unitCode}</span>
                  <span className="min-w-0 truncate text-slate-600">{r.tenantName}</span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}

      <Section title="空室" count={vacant.length}>
        {vacant.length === 0 ? (
          <Empty>空室はありません</Empty>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {vacant.map((u) => (
              <li key={u.id}>
                <Link
                  to={`/units/${u.id}`}
                  className="flex items-center justify-between rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 hover:border-amber-500"
                >
                  <span className="text-xl font-bold tabular-nums">{u.code}</span>
                  <span className="text-base text-slate-700">
                    {u.rent != null ? (
                      `${u.rent.toLocaleString("ja-JP")}円で募集中`
                    ) : (
                      <span className="font-bold text-amber-800">募集家賃を入力</span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="今月の予定" count={thisMonth.length}>
        {thisMonth.length === 0 ? (
          <Empty>今月の予定はありません</Empty>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {thisMonth.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                <span className="w-28 shrink-0 text-slate-500">{formatJa(p.scheduledOn)}</span>
                <span className="font-bold tabular-nums">{p.unitCode}</span>
                <span className="text-slate-700">{p.typeLabel}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </main>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-bold text-sky-800">
        {title}
        <span className="ml-2 text-base font-medium text-slate-500">({count})</span>
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-slate-500">
      {children}
    </p>
  );
}

function ProcedureRow({ procedure }: { procedure: ProcedureSummary }) {
  return (
    <ListCard
      to={`/procedures/${procedure.id}`}
      accent={procedure.typeLabel === "修繕" ? "amber" : "navy"}
      badge={{ label: procedure.typeLabel, tone: "navy" }}
      code={`${procedure.unitCode}号室`}
      right={<Progress done={procedure.doneCount} total={procedure.totalCount} />}
      title={procedure.nextItemLabel ?? "完了できます"}
      meta={
        <>
          {procedure.scheduledOn && (
            <span className="tabular-nums">予定日 {formatSlash(procedure.scheduledOn)}</span>
          )}
          {procedure.tenantName && <span>・ {procedure.tenantName}</span>}
        </>
      }
    />
  );
}

function WorkOrderRow({ workOrder }: { workOrder: WorkOrderListItem }) {
  return (
    <ListCard
      to={`/work-orders/${workOrder.id}`}
      accent={workOrder.isStale ? "rose" : "amber"}
      badge={{ label: "修繕", tone: workOrder.isStale ? "rose" : "amber" }}
      code={workOrder.unitCode ? `${workOrder.unitCode}号室` : (workOrder.locationNote ?? "共用部")}
      right={
        workOrder.isStale ? (
          <Badge tone="rose">{workOrder.staleDays}日 動きなし</Badge>
        ) : undefined
      }
      title={workOrder.title}
      meta={
        <>
          <span className="tabular-nums">発生 {formatSlash(workOrder.occurredOn)}</span>
          <span>
            ・ {workOrder.handlerLabel}
            {workOrder.waitingOn ? ` — ${workOrder.waitingOn}まち` : ""}
          </span>
        </>
      }
    />
  );
}
