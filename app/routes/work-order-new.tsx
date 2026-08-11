import { Link, redirect } from "react-router";

import { listUnitOptions } from "@db/repositories/units.server";
import { createWorkOrder } from "@db/repositories/work-orders.server";
import { WorkOrderForm } from "~/components/work-order-form";
import { todayInTokyo } from "~/lib/date";
import { requireOrg } from "~/lib/auth.server";
import { parseWorkOrderForm } from "~/lib/work-order-form.server";
import type { Route } from "./+types/work-order-new";

export function meta(_: Route.MetaArgs) {
  return [{ title: "修繕の登録 | 家主の帳面" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { ctx } = await requireOrg(request);
  return { units: await listUnitOptions(ctx), today: todayInTokyo() };
}

export async function action({ request }: Route.ActionArgs) {
  const { ctx } = await requireOrg(request);
  const input = parseWorkOrderForm(await request.formData());
  const id = await createWorkOrder(ctx, input);
  return redirect(`/work-orders/${id}`);
}

export default function WorkOrderNew({ loaderData }: Route.ComponentProps) {
  const { units, today } = loaderData;

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 pb-16">
      <Link to="/work-orders" className="text-slate-500 hover:underline">
        ← 修繕
      </Link>
      <h1 className="mt-3 text-2xl font-bold">修繕の登録</h1>

      <WorkOrderForm
        units={units}
        submitLabel="登録する"
        values={{
          unitId: null,
          locationNote: null,
          title: "",
          description: null,
          occurredOn: today,
          handler: null,
          waitingOn: null,
          status: "todo",
          cost: null,
          paid: false,
        }}
      />
    </main>
  );
}
