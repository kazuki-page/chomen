import { Form, Link, redirect } from "react-router";

import { createBuilding } from "@db/repositories/buildings.server";
import { requireOrg } from "~/lib/auth.server";
import type { Route } from "./+types/building-new";

export function meta(_: Route.MetaArgs) {
  return [{ title: "建物の登録 | 家主の帳面" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireOrg(request);
  return {};
}

export async function action({ request }: Route.ActionArgs) {
  const { ctx } = await requireOrg(request);
  const form = await request.formData();

  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "建物の名前を入力してください" };

  await createBuilding(ctx, {
    name,
    address: String(form.get("address") ?? "").trim() || null,
  });

  return redirect("/units/new");
}

export default function BuildingNew({ actionData }: Route.ComponentProps) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-6 pb-16">
      <Link to="/units" className="text-slate-500 hover:underline">
        ← 部屋・駐車場
      </Link>
      <h1 className="mt-3 text-2xl font-bold">建物の登録</h1>
      <p className="mt-2 text-base text-slate-600">
        登録すると、続けて部屋番号をまとめて作れます。
      </p>

      {actionData?.error && (
        <p className="mt-4 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-base text-rose-900">
          {actionData.error}
        </p>
      )}

      <Form method="post" className="mt-6 space-y-5">
        <label className="block">
          <span className="text-base font-medium text-slate-700">建物の名前</span>
          <input
            type="text"
            name="name"
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-lg"
          />
        </label>
        <label className="block">
          <span className="text-base font-medium text-slate-700">住所</span>
          <span className="mt-0.5 block text-sm text-slate-500">帳票に印刷されます</span>
          <input
            type="text"
            name="address"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-lg"
          />
        </label>
        <button
          type="submit"
          className="w-full rounded-xl bg-sky-600 px-4 py-4 text-lg font-bold text-white hover:bg-sky-700"
        >
          登録して部屋を作る
        </button>
      </Form>
    </main>
  );
}
