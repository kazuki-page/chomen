import { Form, Link, redirect } from "react-router";

import {
  commitLeaseImport,
  previewLeaseImport,
  type ImportPreview,
} from "@db/services/lease-import.server";
import { requireOrg } from "~/lib/auth.server";
import { IMPORT_COLUMNS, MAX_IMPORT_ROWS } from "~/lib/constants";
import { formatJa } from "~/lib/date";
import type { Route } from "./+types/lease-import";

export function meta(_: Route.MetaArgs) {
  return [{ title: "契約の一括登録 | おおやさん" }];
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
    const result = await commitLeaseImport(ctx, text);
    return redirect(`/units?created=0&imported=${result.imported}`);
  }

  if (!text.trim()) {
    return { preview: null, text, error: "貼り付けてください" };
  }

  return { preview: await previewLeaseImport(ctx, text), text, error: null };
}

export default function LeaseImport({ actionData }: Route.ComponentProps) {
  const preview = actionData?.preview ?? null;

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 pb-16">
      <Link to="/units" className="text-slate-500 hover:underline">
        ← 部屋・駐車場
      </Link>
      <h1 className="mt-3 text-2xl font-bold">契約の一括登録</h1>
      <p className="mt-2 text-base text-slate-600">
        導入時に、すでに入居している部屋をまとめて登録します。
        Excel や Notion の表をそのままコピーして貼り付けてください。
      </p>

      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-base font-bold">列の順番</h2>
        <ol className="mt-2 flex flex-wrap gap-2 text-sm">
          {IMPORT_COLUMNS.map((c, i) => (
            <li key={c} className="rounded-lg bg-slate-100 px-3 py-1 tabular-nums">
              {i + 1}. {c}
            </li>
          ))}
        </ol>
        <p className="mt-3 text-sm text-slate-500">
          見出し行があれば自動で読み飛ばします。日付は <code>2025/4/1</code> でも{" "}
          <code>2025-04-01</code> でも構いません。家賃の「,」や「円」も無視します。
          一度に{MAX_IMPORT_ROWS}行までです。
        </p>
        <p className="mt-2 text-sm text-slate-500">
          <strong className="text-slate-700">過去の入居履歴も入れられます。</strong>
          状態に「終了」と書くか退去日を入れると、終了した契約として登録します。
          その部屋に今の入居者がいても構いません（更新手続きは作られません）。
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
          placeholder={"101\t甲野 太郎\t1985\t2025/4/1\t68,000\n102\t乙川 幸子\t1990\t2025/6/1\t70,000"}
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

/**
 * 確認画面。**ここを通らないと書き込まれない。**
 * 一括投入は取り消しが効かないので、何が作られるかを必ず見せる。
 */
function PreviewTable({ preview, text }: { preview: ImportPreview; text: string }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold">確認</h2>
      <p className="mt-2 text-base">
        <span className="font-bold text-emerald-700">{preview.okCount}件</span> を登録できます
        {preview.pastCount > 0 && `（うち過去の契約 ${preview.pastCount}件）`}。
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
              <th className="px-3 py-2">入居者</th>
              <th className="px-3 py-2">種類</th>
              <th className="px-3 py-2">契約日</th>
              <th className="px-3 py-2">家賃</th>
              <th className="px-3 py-2">次回更新 / 退去日</th>
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
                  <td className="px-3 py-2">{row.tenantName || "—"}</td>
                  <td className="px-3 py-2">
                    {row.isPast ? (
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-sm">過去</span>
                    ) : (
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sm text-sky-800">
                        現在
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{formatJa(row.contractDate) || "—"}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {row.rent != null ? `${row.rent.toLocaleString("ja-JP")}円` : "—"}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {row.isPast
                      ? formatJa(row.endedOn) || "退去日なし"
                      : formatJa(row.nextRenewalDate) || "—"}
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
          <p className="mt-2 text-center text-sm text-slate-500">
            現在の契約には次回の更新手続きも自動で作られます。過去の契約には作られません
          </p>
        </Form>
      )}
    </section>
  );
}
