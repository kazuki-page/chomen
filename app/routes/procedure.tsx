import { Form, Link, redirect } from "react-router";

import { templateFor } from "@db/procedure-templates";
import { getProcedure } from "@db/repositories/procedures.server";
import { setItemChecked } from "@db/services/procedures.server";
import { formatJa } from "~/lib/date";
import { requireOrg } from "~/lib/auth.server";
import type { Route } from "./+types/procedure";

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [{ title: "手続き | 家主の帳面" }];
  const { unitCode, typeLabel } = loaderData.procedure;
  return [{ title: `${unitCode} ${typeLabel} | 家主の帳面` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { ctx } = await requireOrg(request);
  const procedure = await getProcedure(ctx, params.procedureId);
  if (!procedure) throw new Response("見つかりません", { status: 404 });
  return { procedure };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { ctx } = await requireOrg(request);
  const form = await request.formData();
  const rent = form.get("newRent");

  await setItemChecked(ctx, {
    procedureId: params.procedureId,
    itemId: String(form.get("itemId")),
    checked: form.get("checked") === "1",
    valueText: (form.get("valueText") as string | null) || null,
    newRent: rent ? Number(rent) : null,
  });

  return redirect(`/procedures/${params.procedureId}`);
}

export default function Procedure({ loaderData }: Route.ComponentProps) {
  const { procedure } = loaderData;
  const template = templateFor(procedure.type);
  const isDone = procedure.status === "done";
  const nextItem = procedure.items.find((i) => !i.checked);

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 pb-16">
      <Link to="/" className="text-slate-500 hover:underline">
        ← ホーム
      </Link>

      <header className="mt-3">
        <div className="flex items-center gap-3">
          <span className="text-3xl font-bold tabular-nums">{procedure.unitCode}</span>
          <span className="rounded-full bg-slate-200 px-3 py-1 text-base font-medium">
            {procedure.typeLabel}
          </span>
        </div>
        <p className="mt-2 text-slate-600">
          {procedure.tenantName && <span className="mr-3">{procedure.tenantName}</span>}
          {procedure.scheduledOn && <span>予定日 {formatJa(procedure.scheduledOn)}</span>}
        </p>
        <p className="mt-1 text-sm text-slate-500 tabular-nums">
          {procedure.doneCount} / {procedure.totalCount} 完了
        </p>
      </header>

      {isDone ? (
        <p className="mt-6 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-4 text-lg font-bold text-emerald-900">
          この手続きは完了しています
        </p>
      ) : nextItem ? (
        <NextStep
          item={nextItem}
          type={procedure.type}
          valueLabel={template.items.find((t) => t.key === nextItem.key)?.valueLabel}
          hint={template.items.find((t) => t.key === nextItem.key)?.hint}
        />
      ) : null}

      <section className="mt-8">
        <h2 className="text-lg font-bold">すべての手順</h2>
        <ol className="mt-3 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {procedure.items.map((item) => (
            <li key={item.id} className="flex items-start gap-3 px-4 py-3">
              <span
                className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  item.checked
                    ? "bg-emerald-600 text-white"
                    : "border border-slate-300 text-slate-400"
                }`}
                aria-hidden
              >
                {item.checked ? "✓" : ""}
              </span>
              <div className="min-w-0 flex-1">
                <p className={item.checked ? "text-slate-500 line-through" : "font-medium"}>
                  {item.label}
                </p>
                {item.valueText && (
                  <p className="mt-0.5 text-sm text-slate-500">{item.valueText}</p>
                )}
              </div>
              {item.checked && !isDone && (
                <Form method="post">
                  <input type="hidden" name="itemId" value={item.id} />
                  <input type="hidden" name="checked" value="0" />
                  <button
                    type="submit"
                    className="shrink-0 rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                  >
                    取り消す
                  </button>
                </Form>
              )}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}

function NextStep({
  item,
  type,
  valueLabel,
  hint,
}: {
  item: { id: string; key: string; label: string };
  type: string;
  valueLabel?: string;
  hint?: string;
}) {
  // 更新後の家賃はここで決まる。入力すると家賃改定が「予定」として登録される
  const asksRent = type === "renewal" && item.key === "notice_decided";

  return (
    <section className="mt-6 rounded-xl border-2 border-sky-500 bg-white p-5">
      <p className="text-sm font-bold text-sky-700">次にやること</p>
      <h2 className="mt-1 text-xl font-bold">{item.label}</h2>
      {hint && <p className="mt-2 text-base text-slate-600">{hint}</p>}

      <Form method="post" className="mt-4 space-y-4">
        <input type="hidden" name="itemId" value={item.id} />
        <input type="hidden" name="checked" value="1" />

        {valueLabel && (
          <label className="block">
            <span className="text-base font-medium text-slate-700">{valueLabel}</span>
            <input
              type="text"
              name="valueText"
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-3 text-lg"
            />
          </label>
        )}

        {asksRent && (
          <label className="block">
            <span className="text-base font-medium text-slate-700">更新後の家賃（円）</span>
            <input
              type="number"
              name="newRent"
              inputMode="numeric"
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-3 text-lg tabular-nums"
            />
            <span className="mt-1 block text-sm text-slate-500">
              据え置きの場合も現在の家賃を入力してください
            </span>
          </label>
        )}

        <button
          type="submit"
          className="w-full rounded-xl bg-sky-600 px-4 py-4 text-lg font-bold text-white hover:bg-sky-700"
        >
          完了にする
        </button>
      </Form>
    </section>
  );
}
