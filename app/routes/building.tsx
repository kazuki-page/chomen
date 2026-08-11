import { Form, Link, redirect } from "react-router";

import { getBuilding, updateBuilding } from "@db/repositories/buildings.server";
import { requireOrg } from "~/lib/auth.server";
import type { Route } from "./+types/building";

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [{ title: "建物 | 家主の帳面" }];
  return [{ title: `${loaderData.building.name} | 家主の帳面` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { ctx } = await requireOrg(request);
  const building = await getBuilding(ctx, params.buildingId);
  if (!building) throw new Response("見つかりません", { status: 404 });
  return { building };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { ctx } = await requireOrg(request);
  const form = await request.formData();

  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "建物の名前を入力してください" };

  await updateBuilding(ctx, params.buildingId, {
    name,
    address: String(form.get("address") ?? "").trim() || null,
  });

  return redirect("/settings");
}

export default function Building({ loaderData, actionData }: Route.ComponentProps) {
  const { building } = loaderData;

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 pb-16">
      <Link to="/settings" className="text-slate-500 hover:underline">
        ← 設定
      </Link>
      <h1 className="mt-3 text-2xl font-bold">建物の編集</h1>

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
            defaultValue={building.name}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-lg"
          />
        </label>
        <label className="block">
          <span className="text-base font-medium text-slate-700">住所</span>
          <span className="mt-0.5 block text-sm text-slate-500">帳票に印刷されます</span>
          <input
            type="text"
            name="address"
            defaultValue={building.address ?? ""}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-lg"
          />
        </label>
        <button
          type="submit"
          className="w-full rounded-xl bg-sky-600 px-4 py-4 text-lg font-bold text-white hover:bg-sky-700"
        >
          保存する
        </button>
      </Form>
    </main>
  );
}
