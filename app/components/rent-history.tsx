import { Form, useNavigation } from "react-router";
import type { RentHistoryRow, UnitLeaseRow } from "@db/repositories/units.server";
import { RENT_REASON_LABELS } from "~/lib/constants";
import { formatSlash } from "~/lib/date";

export type RentHistoryInput = { leaseId: string; effectiveFrom: string; amount: string; reason: string };

export function RentHistory({ rows, leases, today, input }: {
  rows: RentHistoryRow[]; leases: UnitLeaseRow[]; today: string; input?: RentHistoryInput;
}) {
  const navigation = useNavigation();
  const intent = navigation.formData?.get("intent");
  const busy = navigation.state !== "idle" && (intent === "add_rent_history" || intent === "delete_rent_history");
  const targets = leases.filter((lease) => lease.status !== "pending");
  const fieldClass = "mt-1 w-full rounded-lg border border-slate-400 bg-white px-3 py-3 text-lg";
  return <>
    <p className="mb-3 text-base text-slate-600">記録を追加・削除すると、現在の家賃や更新一覧の値上げ履歴にも反映されます。</p>
    {targets.length > 0 && <details open={input ? true : undefined} className="mb-4 rounded-xl border border-sky-300 bg-sky-50 p-4">
      <summary className="min-h-12 cursor-pointer py-3 text-lg font-bold text-sky-800">過去の家賃を追加</summary>
      <p className="text-base text-slate-700">過去の契約書などで確認できる家賃を登録します。これから行う更新は、更新手続きから進めてください。</p>
      <Form method="post" className="mt-4 space-y-4">
        <input type="hidden" name="intent" value="add_rent_history" />
        <label className="block text-base font-medium">対象の契約
          <select name="leaseId" required defaultValue={input?.leaseId ?? targets[0].id} className={fieldClass}>
            {targets.map((lease) => <option key={lease.id} value={lease.id}>
              {lease.tenantName ?? "氏名不明"} · {formatSlash(lease.contractDate)}〜{lease.status === "active" ? "現在" : formatSlash(lease.endedOn) || "退居日不明"}
            </option>)}
          </select>
        </label>
        <label className="block text-base font-medium">適用日
          <input type="date" name="effectiveFrom" required max={today} defaultValue={input?.effectiveFrom ?? ""} className={fieldClass} />
          <span className="mt-1 block text-sm text-slate-600">選んだ契約の契約日から退居日まで、かつ今日以前の日付</span>
        </label>
        <label className="block text-base font-medium">家賃（円）
          <input type="number" name="amount" required min="0" step="1" inputMode="numeric" defaultValue={input?.amount ?? ""} className={fieldClass} />
        </label>
        <label className="block text-base font-medium">事由
          <select name="reason" required defaultValue={input?.reason ?? "renewal"} className={fieldClass}>
            {Object.entries(RENT_REASON_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <button type="submit" disabled={busy} className="min-h-12 w-full rounded-xl bg-sky-700 px-4 py-3 text-lg font-bold text-white disabled:opacity-60">
          {busy && intent === "add_rent_history" ? "追加しています…" : "家賃の記録を追加する"}
        </button>
      </Form>
    </details>}
    {rows.length === 0 ? <p className="rounded-xl bg-white p-4 text-lg">家賃の記録はありません。</p> : <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
      {rows.map((row, index) => {
        const previous = rows.slice(index + 1).find((candidate) => candidate.leaseId === row.leaseId && candidate.confirmed);
        const diff = previous ? row.amount - previous.amount : null;
        return <li key={row.id} className="p-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-slate-600 tabular-nums">{formatSlash(row.effectiveFrom)}</span>
            <span className="text-lg font-bold tabular-nums">{row.amount.toLocaleString("ja-JP")}円</span>
            {diff !== null && <span className="text-sm text-slate-600">{diff === 0 ? "据え置き" : `${diff > 0 ? "増額 +" : "減額 −"}${Math.abs(diff).toLocaleString("ja-JP")}円`}</span>}
            <span className="text-sm text-slate-600">{RENT_REASON_LABELS[row.reason]}</span>
            {!row.confirmed && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-sm text-amber-800">予定</span>}
            {row.tenantName && <span className="text-sm text-slate-600">{row.tenantName}</span>}
          </div>
          {row.canDelete ? <details className="mt-2 border-t border-slate-200">
            <summary className="min-h-12 cursor-pointer py-3 text-base font-medium text-rose-800">この記録を削除</summary>
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
              <p className="text-base">{row.tenantName ?? "氏名不明"} · {formatSlash(row.effectiveFrom)} · {row.amount.toLocaleString("ja-JP")}円（{RENT_REASON_LABELS[row.reason]}）を削除します。</p>
              <p className="mt-2 text-base">契約や手続きは残ります。最後の家賃記録を削除すると金額は不明になります。この削除は元に戻せません。</p>
              <Form method="post" className="mt-3">
                <input type="hidden" name="intent" value="delete_rent_history" />
                <input type="hidden" name="revisionId" value={row.id} />
                <input type="hidden" name="effectiveFrom" value={row.effectiveFrom} />
                <input type="hidden" name="amount" value={row.amount} />
                <input type="hidden" name="version" value={row.version} />
                <label className="flex min-h-12 items-start gap-3 py-3 text-base"><input type="checkbox" name="confirmedDelete" value="yes" required className="mt-1 h-6 w-6 shrink-0" />この日付・金額の記録1件を削除することを確認しました</label>
                <button type="submit" disabled={busy} className="min-h-12 w-full rounded-xl border-2 border-rose-700 px-4 py-3 text-lg font-bold text-rose-800 disabled:opacity-60">
                  {busy && intent === "delete_rent_history" ? "削除しています…" : "確認した家賃記録を削除する"}
                </button>
              </Form>
            </div>
          </details> : <p className="mt-2 text-sm text-slate-600">手続きで使用中の家賃は、手続き側で確認してください。</p>}
        </li>;
      })}
    </ul>}
  </>;
}
