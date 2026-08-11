import { Link, redirect } from "react-router";

import { listUnitOptions } from "@db/repositories/units.server";
import { getWorkOrder, updateWorkOrder } from "@db/repositories/work-orders.server";
import { WorkOrderForm } from "~/components/work-order-form";
import { STALE_THRESHOLD_DAYS } from "~/lib/constants";
import { requireOrg } from "~/lib/auth.server";
import { parseWorkOrderForm } from "~/lib/work-order-form.server";
import type { Route } from "./+types/work-order";

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [{ title: "修繕 | 家主の帳面" }];
  return [{ title: `${loaderData.workOrder.title} | 家主の帳面` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { ctx } = await requireOrg(request);
  const workOrder = await getWorkOrder(ctx, params.workOrderId, { now: new Date() });
  if (!workOrder) throw new Response("見つかりません", { status: 404 });

  return { workOrder, units: await listUnitOptions(ctx) };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { ctx } = await requireOrg(request);
  const input = parseWorkOrderForm(await request.formData());
  await updateWorkOrder(ctx, params.workOrderId, input);
  return redirect(`/work-orders/${params.workOrderId}`);
}

export default function WorkOrder({ loaderData }: Route.ComponentProps) {
  const { workOrder, units } = loaderData;

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 pb-16">
      <Link to="/work-orders" className="text-slate-500 hover:underline">
        ← 修繕
      </Link>

      <h1 className="mt-3 text-2xl font-bold">{workOrder.title}</h1>
      <p className="mt-1 text-slate-600">
        {workOrder.unitCode ? `${workOrder.unitCode} 号室` : (workOrder.locationNote ?? "共用部")}
      </p>

      {workOrder.isStale && (
        <p className="mt-4 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-base font-medium text-rose-900">
          {workOrder.staleDays}日間 動きがありません（{STALE_THRESHOLD_DAYS}日で警告します）。
          状況が変わっていれば更新してください。
        </p>
      )}

      <WorkOrderForm
        units={units}
        submitLabel="保存する"
        values={{
          unitId: workOrder.unitId,
          locationNote: workOrder.locationNote,
          title: workOrder.title,
          description: workOrder.description,
          occurredOn: workOrder.occurredOn,
          handler: workOrder.handler,
          waitingOn: workOrder.waitingOn,
          status: workOrder.status,
          cost: workOrder.cost,
          paid: workOrder.paid,
        }}
      />
    </main>
  );
}
