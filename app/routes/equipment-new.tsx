import { useState } from "react";
import { Form, Link, redirect } from "react-router";

import {
  createEquipmentRecord,
  listEquipmentForUnit,
} from "@db/repositories/equipment.server";
import { listUnitOptions } from "@db/repositories/units.server";
import { requireOrg } from "~/lib/auth.server";
import {
  EQUIPMENT_CATEGORIES,
  EQUIPMENT_CATEGORY_LABELS,
  categoryHasModel,
  type EquipmentCategory,
} from "~/lib/constants";
import { formatJa, todayInTokyo } from "~/lib/date";
import type { Route } from "./+types/equipment-new";

export function meta(_: Route.MetaArgs) {
  return [{ title: "設備の記録 | 家主の帳面" }];
}

const CATEGORY_VALUES = EQUIPMENT_CATEGORIES.map((c) => c.value) as readonly string[];

function parseCategory(value: string | null): EquipmentCategory {
  return value && CATEGORY_VALUES.includes(value)
    ? (value as EquipmentCategory)
    : "water_heater";
}

export async function loader({ request }: Route.LoaderArgs) {
  const { ctx } = await requireOrg(request);
  const params = new URL(request.url).searchParams;
  const unitId = params.get("unitId");
  const category = parseCategory(params.get("category"));

  const units = (await listUnitOptions(ctx)).filter((u) => u.type === "room");
  const selectedUnitId = unitId ?? units[0]?.id ?? "";

  // 同じ部屋・同じ種別の履歴を見せる。「前回いつ替えたか」がその場で分かる
  const history = selectedUnitId
    ? (await listEquipmentForUnit(ctx, selectedUnitId)).filter((r) => r.category === category)
    : [];

  return { units, selectedUnitId, category, history, today: todayInTokyo() };
}

export async function action({ request }: Route.ActionArgs) {
  const { ctx } = await requireOrg(request);
  const form = await request.formData();

  const unitId = String(form.get("unitId") ?? "");
  const performedOn = String(form.get("performedOn") ?? "");
  if (!unitId || !performedOn) return { error: "部屋と実施日を入力してください" };

  const cost = String(form.get("cost") ?? "").trim();
  await createEquipmentRecord(ctx, {
    unitId,
    category: parseCategory(String(form.get("category") ?? "")),
    performedOn,
    maker: String(form.get("maker") ?? "").trim() || null,
    modelNumber: String(form.get("modelNumber") ?? "").trim() || null,
    cost: cost ? Number(cost) : null,
    note: String(form.get("note") ?? "").trim() || null,
  });

  return redirect("/equipment");
}

export default function EquipmentNew({ loaderData, actionData }: Route.ComponentProps) {
  const { units, selectedUnitId, category, history, today } = loaderData;
  const [selected, setSelected] = useState<EquipmentCategory>(category);
  const hasModel = categoryHasModel(selected);

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 pb-16">
      <Link to="/equipment" className="text-slate-500 hover:underline">
        ← 設備
      </Link>
      <h1 className="mt-3 text-2xl font-bold">設備の記録</h1>

      {actionData?.error && (
        <p className="mt-4 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-base text-rose-900">
          {actionData.error}
        </p>
      )}

      {history.length > 0 && (
        <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-base font-bold">
            この部屋の「{EQUIPMENT_CATEGORY_LABELS[category]}」の履歴
          </h2>
          <ul className="mt-2 space-y-1 text-base">
            {history.map((r, i) => (
              <li key={r.id} className="flex flex-wrap gap-x-3 tabular-nums">
                <span className={i === 0 ? "font-bold" : "text-slate-500"}>
                  {formatJa(r.performedOn)}
                  {i === 0 && <span className="ml-1 text-sm">（前回）</span>}
                </span>
                {r.modelNumber && <span className="text-slate-600">{r.modelNumber}</span>}
                {r.cost != null && (
                  <span className="text-slate-600">{r.cost.toLocaleString("ja-JP")}円</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <Form method="post" className="mt-6 space-y-5">
        <label className="block">
          <span className="text-base font-medium text-slate-700">部屋</span>
          <select
            name="unitId"
            defaultValue={selectedUnitId}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-lg"
          >
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.code} 号室
              </option>
            ))}
          </select>
        </label>

        <fieldset>
          <legend className="text-base font-medium text-slate-700">種別</legend>
          <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {EQUIPMENT_CATEGORIES.map((c) => (
              <label key={c.value} className="cursor-pointer">
                <input
                  type="radio"
                  name="category"
                  value={c.value}
                  checked={selected === c.value}
                  onChange={() => setSelected(c.value)}
                  className="peer sr-only"
                />
                <span className="block rounded-lg border border-slate-300 bg-white px-2 py-3 text-center text-base peer-checked:border-sky-600 peer-checked:bg-sky-600 peer-checked:font-bold peer-checked:text-white">
                  {c.label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="block">
          <span className="text-base font-medium text-slate-700">
            {hasModel ? "交換日" : "実施日"}
          </span>
          <input
            type="date"
            name="performedOn"
            required
            defaultValue={today}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-lg"
          />
        </label>

        {hasModel && (
          <>
            <label className="block">
              <span className="text-base font-medium text-slate-700">メーカー</span>
              <input
                type="text"
                name="maker"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-lg"
              />
            </label>
            <label className="block">
              <span className="text-base font-medium text-slate-700">型番</span>
              <input
                type="text"
                name="modelNumber"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-lg"
              />
            </label>
          </>
        )}

        <label className="block">
          <span className="text-base font-medium text-slate-700">費用（円）</span>
          <input
            type="number"
            name="cost"
            inputMode="numeric"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-lg tabular-nums"
          />
        </label>

        <label className="block">
          <span className="text-base font-medium text-slate-700">メモ</span>
          <span className="mt-0.5 block text-sm text-slate-500">
            入居者負担だった場合などはここに書いてください
          </span>
          <textarea
            name="note"
            rows={2}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-lg"
          />
        </label>

        <button
          type="submit"
          className="w-full rounded-xl bg-sky-600 px-4 py-4 text-lg font-bold text-white hover:bg-sky-700"
        >
          記録する
        </button>
      </Form>
    </main>
  );
}
