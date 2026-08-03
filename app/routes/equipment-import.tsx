import { Form, Link, redirect } from "react-router";

import {
  commitEquipmentImport,
  previewEquipmentImport,
  type EquipmentImportPreview,
} from "@db/services/equipment-import.server";
import { requireOrg } from "~/lib/auth.server";
import {
  EQUIPMENT_CATEGORIES,
  EQUIPMENT_CATEGORY_LABELS,
  EQUIPMENT_IMPORT_COLUMNS,
  MAX_IMPORT_ROWS,
  type EquipmentCategory,
} from "~/lib/constants";
import { formatSlash } from "~/lib/date";
import type { Route } from "./+types/equipment-import";

export function meta(_: Route.MetaArgs) {
  return [{ title: "設備の一括登録 | おおやさん" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireOrg(request);
  return {};
}

export async function action({ request }: Route.ActionArgs) {
  const { ctx } = await requireOrg(request);
  const form = await request.formData();
  const text = String(form.get("text") ?? "");

  if (form.get("intent") === "commit") {
    const result = await commitEquipmentImport(ctx, text);
    return redirect(`/equipment?imported=${result.imported}`);
  }

  if (!text.trim()) {
    return { preview: null, text, error: "貼り付けてください" };
  }

  return { preview: await previewEquipmentImport(ctx, text), text, error: null };
}

export default function EquipmentImport({ actionData }: Route.ComponentProps) {
  const preview = actionData?.preview ?? null;

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 pb-16">
      <Link to="/equipment" className="text-slate-500 hover:underline">
        ← 設備
      </Link>
      <h1 className="mt-3 text-2xl font-bold">設備の一括登録</h1>
      <p className="mt-2 text-base text-slate-600">
        Excel などの表をそのままコピーして貼り付けてください。
      </p>

      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-base font-bold">列の順番</h2>
        <ol className="mt-2 flex flex-wrap gap-2 text-sm">
          {EQUIPMENT_IMPORT_COLUMNS.map((c, i) => (
            <li key={c} className="rounded-lg bg-slate-100 px-3 py-1 tabular-nums">
              {i + 1}. {c}
            </li>
          ))}
        </ol>

        <h3 className="mt-3 text-base font-bold">種別に書ける言葉</h3>
        <p className="mt-1 flex flex-wrap gap-2 text-sm">
          {EQUIPMENT_CATEGORIES.map((c) => (
            <span key={c.value} className="rounded-lg bg-slate-100 px-3 py-1">
              {c.label}
            </span>
          ))}
        </p>

        <p className="mt-3 text-sm text-slate-500">
          見出し行があれば自動で読み飛ばします。日付は <code>2025/4/1</code> でも{" "}
          <code>2025-04-01</code> でも構いません。費用の「,」や「円」も無視します。
          一度に{MAX_IMPORT_ROWS}行までです。
        </p>
      </section>

      {actionData?.error && (
        <p className="mt-4 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-base text-rose-900">
          {actionData.error}
        </p>
      )}

      <Form method="post" className="mt-6">
        <textarea
          name="text"
          rows={8}
          required
          defaultValue={actionData?.text ?? ""}
          placeholder={"101\t給湯器\t2016/3/10\tGH-2016\t180,000\n101\t浴室換気扇\t2021/7/2\tBF-2021\t42,000"}
          className="w-full rounded-lg border border-slate-300 px-3 py-3 font-mono text-base"
        />
        <button
          type="submit"
          className="mt-3 w-full rounded-xl border-2 border-slate-800 px-4 py-3 text-lg font-bold hover:bg-slate-100"
        >
          内容を確認する
        </button>
      </Form>

      {preview && <PreviewTable preview={preview} text={actionData?.text ?? ""} />}
    </main>
  );
}

/** 確認画面。**ここを通らないと書き込まれない。** */
function PreviewTable({
  preview,
  text,
}: {
  preview: EquipmentImportPreview;
  text: string;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold">確認</h2>
      <p className="mt-2 text-base">
        <span className="font-bold text-emerald-700">{preview.okCount}件</span> を登録できます。
        {preview.errorCount > 0 && (
          <span className="ml-2 font-bold text-rose-700">
            {preview.errorCount}件はエラーのため取り込みません。
          </span>
        )}
      </p>

      <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-base">
          <thead className="bg-slate-50 text-left text-sm text-slate-600">
            <tr>
              <th className="px-3 py-2">行</th>
              <th className="px-3 py-2">部屋</th>
              <th className="px-3 py-2">種別</th>
              <th className="px-3 py-2">実施日</th>
              <th className="px-3 py-2">型番</th>
              <th className="px-3 py-2">費用</th>
              <th className="px-3 py-2">結果</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {preview.rows.map((row) => {
              const ok = row.errors.length === 0;
              return (
                <tr key={row.lineNumber} className={ok ? "" : "bg-rose-50"}>
                  <td className="px-3 py-2 text-sm text-slate-500 tabular-nums">
                    {row.lineNumber}
                  </td>
                  <td className="px-3 py-2 font-bold tabular-nums">{row.unitCode || "—"}</td>
                  <td className="px-3 py-2">
                    {row.category
                      ? EQUIPMENT_CATEGORY_LABELS[row.category as EquipmentCategory]
                      : row.categoryInput || "—"}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{formatSlash(row.performedOn) || "—"}</td>
                  <td className="px-3 py-2">{row.modelNumber ?? "—"}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {row.cost != null ? `${row.cost.toLocaleString("ja-JP")}円` : "—"}
                  </td>
                  <td className="px-3 py-2 text-sm">
                    {ok ? (
                      <span className="font-medium text-emerald-700">登録できます</span>
                    ) : (
                      <span className="text-rose-800">{row.errors.join(" / ")}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {preview.okCount > 0 && (
        <Form method="post" className="mt-4">
          <input type="hidden" name="intent" value="commit" />
          <input type="hidden" name="text" value={text} />
          <button
            type="submit"
            className="w-full rounded-xl bg-sky-600 px-4 py-4 text-lg font-bold text-white hover:bg-sky-700"
          >
            {preview.okCount}件を登録する
          </button>
        </Form>
      )}
    </section>
  );
}
