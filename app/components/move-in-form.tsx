import { Form } from "react-router";

import type { MoveInTarget } from "@db/repositories/units.server";

/**
 * 入居手続きを始めるための入力欄。
 *
 * 部屋詳細（部屋が決まっている）と入居画面（部屋を選ぶ）の両方で使う。
 * **同じ項目を2か所に書かない**ためにここへ出している。
 * 片方だけ直すと、入口によって集まる情報が変わる。
 *
 * 家賃をここで訊くのは、入居手続きのチェック項目に金額を書く欄が無いため。
 * 契約時には決まっている数字なので、始める時点で受け取る。
 */
export function MoveInFields({
  today,
  units,
}: {
  today: string;
  /** 渡すと部屋の選択欄を出す。部屋詳細から使うときは渡さない */
  units?: MoveInTarget[];
}) {
  return (
    <Form method="post" className="mt-4 space-y-4">
      <input type="hidden" name="intent" value="start_move_in" />

      {units && (
        <label className="block">
          <span className="text-base font-medium text-slate-700">
            部屋・駐車場
          </span>
          <span className="mt-0.5 block text-sm text-slate-500">
            空室と、退居手続きが進んでいるものが選べます
          </span>
          <select
            name="unitId"
            required
            defaultValue=""
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-lg"
          >
            <option value="" disabled>
              選んでください
            </option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.code}（{unit.note}）
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="block">
        <span className="text-base font-medium text-slate-700">
          入居者の氏名
        </span>
        <input
          type="text"
          name="tenantName"
          required
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-lg"
        />
      </label>

      <label className="block">
        <span className="text-base font-medium text-slate-700">生年</span>
        <span className="mt-0.5 block text-sm text-slate-500">西暦・任意</span>
        <input
          type="number"
          name="birthYear"
          inputMode="numeric"
          placeholder="1985"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-lg tabular-nums"
        />
      </label>

      <label className="block">
        <span className="text-base font-medium text-slate-700">契約日</span>
        <input
          type="date"
          name="contractDate"
          required
          defaultValue={today}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-lg"
        />
      </label>

      <label className="block">
        <span className="text-base font-medium text-slate-700">家賃（円）</span>
        <span className="mt-0.5 block text-sm text-slate-500">
          任意。あとから契約の編集でも入れられます
        </span>
        <input
          type="number"
          name="rent"
          inputMode="numeric"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-lg tabular-nums"
        />
      </label>

      <button
        type="submit"
        className="w-full rounded-xl bg-sky-600 px-4 py-3 text-lg font-bold text-white hover:bg-sky-700"
      >
        入居手続きを始める
      </button>
    </Form>
  );
}
