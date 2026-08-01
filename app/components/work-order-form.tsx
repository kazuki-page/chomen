import { Form } from "react-router";

import type { UnitOption } from "@db/repositories/units.server";
import { HANDLER_OPTIONS, WORK_ORDER_STATUS_OPTIONS } from "~/lib/constants";

export type WorkOrderFormValues = {
  unitId: string | null;
  locationNote: string | null;
  title: string;
  description: string | null;
  occurredOn: string;
  handler: string | null;
  waitingOn: string | null;
  status: string;
  cost: number | null;
  paid: boolean;
};

/**
 * 修繕案件の入力フォーム。起票と編集で共用する。
 *
 * 入力項目は意図的に少なくしている。
 * 紙の明細を転記する運用は続かないため、費用は金額のみを記録する。
 */
export function WorkOrderForm({
  units,
  values,
  submitLabel,
}: {
  units: UnitOption[];
  values: WorkOrderFormValues;
  submitLabel: string;
}) {
  return (
    <Form method="post" className="mt-6 space-y-5">
      <Field label="どこの件ですか">
        <select
          name="unitId"
          defaultValue={values.unitId ?? ""}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-lg"
        >
          <option value="">共用部・その他</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.type === "parking" ? `駐車場 ${u.code}` : `${u.code} 号室`}
            </option>
          ))}
        </select>
      </Field>

      <Field label="場所のメモ" hint="共用部のときに「1F 廊下」などを入れてください">
        <input
          type="text"
          name="locationNote"
          defaultValue={values.locationNote ?? ""}
          className="w-full rounded-lg border border-slate-300 px-3 py-3 text-lg"
        />
      </Field>

      <Field label="件名">
        <input
          type="text"
          name="title"
          required
          defaultValue={values.title}
          placeholder="給湯器の不具合"
          className="w-full rounded-lg border border-slate-300 px-3 py-3 text-lg"
        />
      </Field>

      <Field label="内容">
        <textarea
          name="description"
          rows={3}
          defaultValue={values.description ?? ""}
          className="w-full rounded-lg border border-slate-300 px-3 py-3 text-lg"
        />
      </Field>

      <Field label="発生日">
        <input
          type="date"
          name="occurredOn"
          required
          defaultValue={values.occurredOn}
          className="w-full rounded-lg border border-slate-300 px-3 py-3 text-lg"
        />
      </Field>

      <Field label="誰がやりますか">
        <div className="grid grid-cols-3 gap-2">
          {HANDLER_OPTIONS.map((o) => (
            <Radio
              key={o.value}
              name="handler"
              value={o.value}
              label={o.label}
              defaultChecked={values.handler === o.value}
            />
          ))}
        </div>
      </Field>

      <Field label="今なに待ちですか" hint="「業者の見積」「部品の入荷」など。これが分かると放置を防げます">
        <input
          type="text"
          name="waitingOn"
          defaultValue={values.waitingOn ?? ""}
          className="w-full rounded-lg border border-slate-300 px-3 py-3 text-lg"
        />
      </Field>

      <Field label="状態">
        <div className="grid grid-cols-3 gap-2">
          {WORK_ORDER_STATUS_OPTIONS.map((o) => (
            <Radio
              key={o.value}
              name="status"
              value={o.value}
              label={o.label}
              defaultChecked={values.status === o.value}
            />
          ))}
        </div>
      </Field>

      <Field label="費用（円）">
        <input
          type="number"
          name="cost"
          inputMode="numeric"
          defaultValue={values.cost ?? ""}
          className="w-full rounded-lg border border-slate-300 px-3 py-3 text-lg tabular-nums"
        />
      </Field>

      <label className="flex items-center gap-3 rounded-lg border border-slate-300 bg-white px-3 py-3">
        <input
          type="checkbox"
          name="paid"
          value="1"
          defaultChecked={values.paid}
          className="size-6"
        />
        <span className="text-lg">支払い済み</span>
      </label>

      <button
        type="submit"
        className="w-full rounded-xl bg-sky-600 px-4 py-4 text-lg font-bold text-white hover:bg-sky-700"
      >
        {submitLabel}
      </button>
    </Form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-base font-medium text-slate-700">{label}</span>
      {hint && <span className="mt-0.5 block text-sm text-slate-500">{hint}</span>}
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Radio({
  name,
  value,
  label,
  defaultChecked,
}: {
  name: string;
  value: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="cursor-pointer">
      <input
        type="radio"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className="peer sr-only"
      />
      <span className="block rounded-lg border border-slate-300 bg-white px-2 py-3 text-center text-base peer-checked:border-sky-600 peer-checked:bg-sky-600 peer-checked:font-bold peer-checked:text-white">
        {label}
      </span>
    </label>
  );
}
