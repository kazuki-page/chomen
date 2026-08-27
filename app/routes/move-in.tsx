import { Link, redirect } from "react-router";

import { listMoveInTargets } from "@db/repositories/units.server";
import { startMoveIn } from "@db/services/leases.server";
import { MoveInFields } from "~/components/move-in-form";
import { todayInTokyo } from "~/lib/date";
import { requireOrg } from "~/lib/auth.server";
import { parseMoveInForm } from "~/lib/move-in-form.server";
import type { Route } from "./+types/move-in";

export function meta(_: Route.MetaArgs) {
  return [{ title: "入居手続きを始める | 家主の帳面" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { ctx } = await requireOrg(request);
  return { units: await listMoveInTargets(ctx), today: todayInTokyo() };
}

export async function action({ request }: Route.ActionArgs) {
  const { ctx } = await requireOrg(request);
  const form = await request.formData();

  const unitId = String(form.get("unitId") ?? "");
  if (!unitId) return { error: "部屋を選んでください" };

  const parsed = parseMoveInForm(form);
  if (!parsed.ok) return { error: parsed.error };

  const { procedureId } = await startMoveIn(ctx, { unitId, ...parsed.value });

  // 作って終わりにせず、そのままチェックリストへ送る
  return redirect(`/procedures/${procedureId}`);
}

export default function MoveIn({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { units, today } = loaderData;

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 pb-16">
      <Link to="/" className="text-slate-500 hover:underline">
        ← ホーム
      </Link>
      <h1 className="mt-3 text-2xl font-bold">入居が決まった</h1>

      {actionData?.error && (
        <p className="mt-4 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-base font-medium text-rose-900">
          {actionData.error}
        </p>
      )}

      {units.length === 0 ? (
        <p className="mt-6 rounded-xl border border-slate-200 bg-white px-4 py-4 text-base text-slate-600">
          いま入居手続きを始められる部屋はありません。
          <br />
          空室か、退居手続きが進んでいる部屋が対象です。
        </p>
      ) : (
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-base text-slate-600">
            入居手続きが始まります。募集はこの時点で取り下げます。
          </p>
          <MoveInFields today={today} units={units} />
        </section>
      )}
    </main>
  );
}
