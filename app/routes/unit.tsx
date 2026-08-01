import { Form, Link, redirect } from "react-router";

import { listProceduresForUnit } from "@db/repositories/procedures.server";
import { getUnitDetail, updateListing } from "@db/repositories/units.server";
import { listWorkOrders } from "@db/repositories/work-orders.server";
import { startProcedure } from "@db/services/procedures.server";
import { WORK_ORDER_STATUS_LABELS } from "~/lib/constants";
import { formatJa, todayInTokyo } from "~/lib/date";
import { requireOrg } from "~/lib/auth.server";
import type { Route } from "./+types/unit";

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [{ title: "部屋 | おおやさん" }];
  return [{ title: `${loaderData.unit.code} | おおやさん` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { ctx } = await requireOrg(request);
  const today = todayInTokyo();

  const unit = await getUnitDetail(ctx, params.unitId, { asOf: today });
  if (!unit) throw new Response("見つかりません", { status: 404 });

  const [procedures, workOrders] = await Promise.all([
    listProceduresForUnit(ctx, unit.id),
    listWorkOrders(ctx, { now: new Date(), unitId: unit.id }),
  ]);

  return { unit, procedures, workOrders, today };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { ctx } = await requireOrg(request);
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "start_move_out") {
    const unit = await getUnitDetail(ctx, params.unitId, { asOf: todayInTokyo() });
    if (!unit?.lease) throw new Response("契約中ではありません", { status: 400 });

    const procedureId = await startProcedure(ctx, {
      leaseId: unit.lease.id,
      type: "move_out",
      scheduledOn: String(form.get("scheduledOn") || todayInTokyo()),
    });
    return redirect(`/procedures/${procedureId}`);
  }

  if (intent === "save_listing") {
    const rent = form.get("listingRent");
    await updateListing(ctx, params.unitId, {
      rent: rent ? Number(rent) : null,
      startedOn: String(form.get("listingStartedOn") || "") || null,
    });
    return redirect(`/units/${params.unitId}`);
  }

  throw new Response("不明な操作です", { status: 400 });
}

export default function Unit({ loaderData }: Route.ComponentProps) {
  const { unit, procedures, workOrders, today } = loaderData;

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 pb-16">
      <Link to="/units" className="text-slate-500 hover:underline">
        ← 部屋・駐車場
      </Link>

      <header className="mt-3 flex items-center gap-3">
        <h1 className="text-3xl font-bold tabular-nums">{unit.code}</h1>
        {unit.isVacant ? (
          <span className="rounded-full bg-amber-200 px-3 py-1 text-base font-bold text-amber-900">
            空室
          </span>
        ) : (
          <span className="rounded-full bg-slate-200 px-3 py-1 text-base font-medium">入居中</span>
        )}
      </header>

      {unit.lease ? (
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-bold">契約</h2>
          <dl className="mt-3 space-y-2 text-base">
            <Row label="入居者" value={unit.lease.tenantName ?? "—"} />
            <Row
              label="家賃"
              value={
                unit.lease.rent != null ? `${unit.lease.rent.toLocaleString("ja-JP")}円` : "—"
              }
            />
            <Row label="契約日" value={formatJa(unit.lease.contractDate)} />
            <Row label="次回更新" value={formatJa(unit.lease.nextRenewalDate) || "—"} />
          </dl>
        </section>
      ) : (
        <ListingForm
          rent={unit.listingRent}
          startedOn={unit.listingStartedOn}
          today={today}
        />
      )}

      {unit.lease && <MoveOutForm today={today} />}

      <Section title="手続き">
        {procedures.length === 0 ? (
          <Empty>手続きはありません</Empty>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {procedures.map((p) => (
              <li key={p.id}>
                <Link
                  to={`/procedures/${p.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50"
                >
                  <span className="w-28 shrink-0 text-slate-500">
                    {formatJa(p.scheduledOn) || "—"}
                  </span>
                  <span className="font-medium">{p.typeLabel}</span>
                  <span className="ml-auto text-sm text-slate-500">
                    {p.status === "done" ? "完了" : "進行中"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="修繕">
        {workOrders.length === 0 ? (
          <Empty>修繕の記録はありません</Empty>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {workOrders.map((w) => (
              <li key={w.id}>
                <Link
                  to={`/work-orders/${w.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50"
                >
                  <span className="w-28 shrink-0 text-slate-500">{formatJa(w.occurredOn)}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{w.title}</span>
                  <span className="shrink-0 text-sm text-slate-500">
                    {WORK_ORDER_STATUS_LABELS[w.status]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </main>
  );
}

/**
 * 空室の募集内容。
 *
 * 退居手続きの完了時に自動では埋めていない。
 * いくらで募集するかは人が決めることなので、ここで入力してもらう。
 */
function ListingForm({
  rent,
  startedOn,
  today,
}: {
  rent: number | null;
  startedOn: string | null;
  today: string;
}) {
  const notSet = rent === null;

  return (
    <section
      className={`mt-6 rounded-xl border-2 p-4 ${
        notSet ? "border-amber-400 bg-amber-50" : "border-slate-200 bg-white"
      }`}
    >
      <h2 className="text-lg font-bold">募集内容</h2>
      {notSet && (
        <p className="mt-1 text-base text-amber-900">
          募集家賃が未設定です。入力すると一覧と空室リストに表示されます。
        </p>
      )}

      <Form method="post" className="mt-4 space-y-4">
        <input type="hidden" name="intent" value="save_listing" />
        <label className="block">
          <span className="text-base font-medium text-slate-700">募集家賃（円）</span>
          <input
            type="number"
            name="listingRent"
            inputMode="numeric"
            defaultValue={rent ?? ""}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-lg tabular-nums"
          />
        </label>
        <label className="block">
          <span className="text-base font-medium text-slate-700">募集開始日</span>
          <input
            type="date"
            name="listingStartedOn"
            defaultValue={startedOn ?? today}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-lg"
          />
        </label>
        <button
          type="submit"
          className="w-full rounded-xl bg-sky-600 px-4 py-3 text-lg font-bold text-white hover:bg-sky-700"
        >
          保存する
        </button>
      </Form>
    </section>
  );
}

function MoveOutForm({ today }: { today: string }) {
  return (
    <details className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer text-lg font-bold">退居の連絡が来た</summary>
      <Form method="post" className="mt-4 space-y-4">
        <input type="hidden" name="intent" value="start_move_out" />
        <label className="block">
          <span className="text-base font-medium text-slate-700">退居日</span>
          <input
            type="date"
            name="scheduledOn"
            defaultValue={today}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-lg"
          />
        </label>
        <button
          type="submit"
          className="w-full rounded-xl border-2 border-slate-800 px-4 py-3 text-lg font-bold hover:bg-slate-100"
        >
          退居手続きを始める
        </button>
      </Form>
    </details>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold">{title}</h2>
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
