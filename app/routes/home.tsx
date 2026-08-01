import { Link } from "react-router";

import {
  listOpenProcedures,
  listProceduresInMonth,
  type ProcedureSummary,
} from "@db/repositories/procedures.server";
import { listUnits } from "@db/repositories/units.server";
import {
  listOpenWorkOrders,
  type WorkOrderListItem,
} from "@db/repositories/work-orders.server";
import { STALE_THRESHOLD_DAYS } from "~/lib/constants";
import { formatJa, monthRange, todayInTokyo } from "~/lib/date";
import { requireOrg } from "~/lib/auth.server";
import type { Route } from "./+types/home";

export function meta(_: Route.MetaArgs) {
  return [{ title: "ホーム | おおやさん" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { ctx } = await requireOrg(request);
  const now = new Date();
  const asOf = todayInTokyo(now);

  const [procedures, workOrders, units, thisMonth] = await Promise.all([
    listOpenProcedures(ctx),
    listOpenWorkOrders(ctx, { now }),
    listUnits(ctx, { asOf }),
    listProceduresInMonth(ctx, monthRange(asOf)),
  ]);

  return {
    procedures,
    workOrders,
    vacant: units.filter((u) => u.isVacant),
    thisMonth,
  };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { procedures, workOrders, vacant, thisMonth } = loaderData;
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
      <h2 className="text-lg font-bold">
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
    <li>
      <Link
        to={`/procedures/${procedure.id}`}
        className="block rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-400"
      >
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold tabular-nums">{procedure.unitCode}</span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
            {procedure.typeLabel}
          </span>
          <span className="ml-auto text-sm text-slate-500 tabular-nums">
            {procedure.doneCount}/{procedure.totalCount}
          </span>
        </div>
        <p className="mt-2 text-lg font-medium text-slate-900">
          {procedure.nextItemLabel ?? "完了できます"}
        </p>
        {procedure.tenantName && (
          <p className="mt-1 text-sm text-slate-500">{procedure.tenantName}</p>
        )}
      </Link>
    </li>
  );
}

function WorkOrderRow({ workOrder }: { workOrder: WorkOrderListItem }) {
  return (
    <li>
      <Link
        to={`/work-orders/${workOrder.id}`}
        className={`block rounded-xl border p-4 hover:border-slate-400 ${
          workOrder.isStale ? "border-rose-300 bg-rose-50" : "border-slate-200 bg-white"
        }`}
      >
        <div className="flex items-center gap-3">
        <span className="text-xl font-bold tabular-nums">
          {workOrder.unitCode ?? workOrder.locationNote ?? "共用部"}
        </span>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
          修繕
        </span>
        {workOrder.isStale && (
          <span className="ml-auto text-sm font-bold text-rose-700">
            {workOrder.staleDays}日 動きなし
          </span>
        )}
      </div>
        <p className="mt-2 text-lg font-medium text-slate-900">{workOrder.title}</p>
        <p className="mt-1 text-sm text-slate-600">
          {workOrder.handlerLabel}
          {workOrder.waitingOn ? ` — ${workOrder.waitingOn}まち` : ""}
        </p>
      </Link>
    </li>
  );
}
