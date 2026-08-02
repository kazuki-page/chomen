import { Form, Link, useSearchParams } from "react-router";

import { listUnitOptions } from "@db/repositories/units.server";
import {
  listWorkOrderYears,
  listWorkOrders,
  type WorkOrderListItem,
} from "@db/repositories/work-orders.server";
import {
  WORK_ORDER_STATUS_LABELS,
  WORK_ORDER_STATUS_OPTIONS,
  type WorkOrderStatus,
} from "~/lib/constants";
import { formatJa } from "~/lib/date";
import { requireOrg } from "~/lib/auth.server";
import type { Route } from "./+types/work-orders";

export function meta(_: Route.MetaArgs) {
  return [{ title: "修繕 | おおやさん" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const raw = url.searchParams.get("status");
  const status = WORK_ORDER_STATUS_OPTIONS.some((o) => o.value === raw)
    ? (raw as WorkOrderStatus)
    : undefined;

  const { ctx } = await requireOrg(request);
  const unitId = url.searchParams.get("unitId") || undefined;
  const year = Number(url.searchParams.get("year")) || undefined;

  const [items, units, years] = await Promise.all([
    listWorkOrders(ctx, { now: new Date(), status, unitId, year }),
    listUnitOptions(ctx),
    listWorkOrderYears(ctx),
  ]);

  return { items, units, years, unitId: unitId ?? "", year: year ?? 0 };
}

export default function WorkOrders({ loaderData }: Route.ComponentProps) {
  const { items, units, years, unitId, year } = loaderData;
  const [params] = useSearchParams();
  const active = params.get("status") ?? "";

  /** 他の絞り込みを保ったままリンクを作る */
  const withParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    return `/work-orders${next.toString() ? `?${next}` : ""}`;
  };

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 pb-16">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">修繕</h1>
        <Link
          to="/work-orders/new"
          className="rounded-xl bg-sky-600 px-4 py-3 text-base font-bold text-white hover:bg-sky-700"
        >
          ＋ 新しい案件
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <FilterLink to={withParam("status", "")} label="すべて" active={active === ""} />
        {WORK_ORDER_STATUS_OPTIONS.map((o) => (
          <FilterLink
            key={o.value}
            to={withParam("status", o.value)}
            label={o.label}
            active={active === o.value}
          />
        ))}
      </div>

      <Form method="get" className="mt-3 flex flex-wrap gap-2">
        {active && <input type="hidden" name="status" value={active} />}
        <select
          name="unitId"
          defaultValue={unitId}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-base"
        >
          <option value="">すべての部屋</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.type === "parking" ? `駐車場 ${u.code}` : `${u.code} 号室`}
            </option>
          ))}
        </select>
        <select
          name="year"
          defaultValue={year || ""}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-base tabular-nums"
        >
          <option value="">すべての年</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}年
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg border-2 border-slate-800 px-4 py-2 text-base font-bold hover:bg-slate-100"
        >
          絞り込む
        </button>
        {(unitId || year) && (
          <Link
            to={withParam("status", active).replace(/[?&](unitId|year)=[^&]*/g, "")}
            className="rounded-lg px-3 py-2 text-base text-slate-500 hover:bg-slate-100"
          >
            解除
          </Link>
        )}
      </Form>

      {items.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-slate-500">
          該当する案件はありません
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map((w) => (
            <WorkOrderRow key={w.id} workOrder={w} />
          ))}
        </ul>
      )}
    </main>
  );
}

function FilterLink({ to, label, active }: { to: string; label: string; active: boolean }) {
  return (
    <Link
      to={to}
      className={`rounded-lg px-4 py-2 text-base font-medium ${
        active ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-100"
      }`}
    >
      {label}
    </Link>
  );
}

function WorkOrderRow({ workOrder }: { workOrder: WorkOrderListItem }) {
  const done = workOrder.status === "done";
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
          <span
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              done ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"
            }`}
          >
            {WORK_ORDER_STATUS_LABELS[workOrder.status]}
          </span>
          {workOrder.isStale && (
            <span className="ml-auto text-sm font-bold text-rose-700">
              {workOrder.staleDays}日 動きなし
            </span>
          )}
        </div>
        <p className={`mt-2 text-lg font-medium ${done ? "text-slate-500" : ""}`}>
          {workOrder.title}
        </p>
        <p className="mt-1 text-sm text-slate-600">
          {formatJa(workOrder.occurredOn)} ・ {workOrder.handlerLabel}
          {workOrder.waitingOn ? ` ・ ${workOrder.waitingOn}まち` : ""}
        </p>
      </Link>
    </li>
  );
}
