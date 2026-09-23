import { Form, Link, redirect, useNavigation } from "react-router";
import { listRenewalRepairCandidates, repairRenewalHistory } from "@db/repositories/lease-history-repair.server";
import { requireOrg } from "~/lib/auth.server";
import { formatSlash } from "~/lib/date";
import type { Route } from "./+types/renewal-history-repair";

export function meta() { return [{ title: "更新履歴の確認・修正 | 家主の帳面" }]; }
export async function loader({ request }: Route.LoaderArgs) {
  const { ctx } = await requireOrg(request);
  return { candidates: await listRenewalRepairCandidates(ctx), repaired: new URL(request.url).searchParams.has("repaired") };
}
export async function action({ request }: Route.ActionArgs) {
  const { ctx } = await requireOrg(request);
  const form = await request.formData();
  if (form.get("confirmedSameOccupancy") !== "yes") return { error: "同じ人の継続した入居中の更新であることを確認してください。" };
  const result = await repairRenewalHistory(ctx, {
    unitId: String(form.get("unitId") ?? ""),
    sourceLeaseId: String(form.get("sourceLeaseId") ?? ""),
    targetLeaseId: String(form.get("targetLeaseId") ?? ""),
    now: new Date(),
  });
  if (!result.ok) return { error: result.error };
  return redirect("/renewals/history-repair?repaired=1");
}
export default function RenewalHistoryRepair({ loaderData: { candidates, repaired }, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== "idle";
  return <main className="mx-auto max-w-4xl px-4 py-6 pb-16">
    <Link to="/renewals" className="inline-flex min-h-12 items-center text-sky-800 underline">← 更新一覧</Link>
    <h1 className="mt-2 text-2xl font-bold">更新履歴の確認・修正</h1>
    <p className="mt-3 text-base">同じ部屋・同じ氏名の契約が分かれている候補です。別人や、退居後の再入居はまとめないでください。</p>
    <p className="mt-2 text-base">修正すると家賃履歴を1つの契約にまとめ、現在の契約の初回家賃を「更新」に直します。過去の契約の行はなくなり、契約開始日は過去の契約日に変わります。金額・日付・次回更新日は残ります。</p>
    <p className="mt-2 text-base font-bold">この操作は画面から元に戻せません。2つの契約を確認してから実行してください。</p>
    {repaired && <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-4 text-emerald-900">履歴をまとめました。さらに古い候補があれば続けて表示しています。</p>}
    {actionData?.error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-4 text-rose-900">{actionData.error}</p>}
    <h2 className="mt-6 text-xl font-bold">確認候補 {candidates.length}件</h2>
    {!candidates.length && <p className="mt-4">該当する候補はありません。</p>}
    <ul className="mt-4 space-y-4">{candidates.map(({ unitId, unitCode, source, target }) => (
      <li key={target.id} className="rounded-xl border border-slate-300 bg-white p-4">
        <h3 className="text-xl font-bold"><Link to={`/units/${unitId}`} className="inline-flex min-h-12 items-center text-sky-800 underline">{unitCode}</Link> · {target.tenantName}</h3>
        <p className="text-lg">{formatSlash(source.contractDate)} · {source.rent === null ? "家賃不明" : `${source.rent.toLocaleString("ja-JP")}円`} → {formatSlash(target.contractDate)} · {target.rent === null ? "家賃不明" : `${target.rent.toLocaleString("ja-JP")}円`}</p>
        {source.procedureCount > 0 ? <p className="mt-2 text-amber-800">過去の契約に手続きがあるため、この画面では修正できません。</p> : (
          <Form method="post" className="mt-2">
            <input type="hidden" name="unitId" value={unitId} />
            <input type="hidden" name="sourceLeaseId" value={source.id} />
            <input type="hidden" name="targetLeaseId" value={target.id} />
            <label className="flex min-h-12 items-start gap-3 py-3 text-base"><input type="checkbox" name="confirmedSameOccupancy" value="yes" required className="mt-1 h-6 w-6 shrink-0" />同じ人の継続入居中の更新です。表示された2契約をまとめることを確認しました。</label>
            <button disabled={busy} className="rounded-xl bg-sky-700 px-4 py-3 text-lg font-bold text-white disabled:opacity-50">確認した2契約をまとめる</button>
          </Form>
        )}
      </li>
    ))}</ul>
  </main>;
}
