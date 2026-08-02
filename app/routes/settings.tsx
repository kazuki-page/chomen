import { Form, Link, redirect } from "react-router";

import { listBuildings } from "@db/repositories/buildings.server";
import { listMembers } from "@db/repositories/memberships.server";
import {
  createInvitation,
  listPendingInvitations,
  revokeInvitation,
} from "@db/services/invitations.server";
import { requireAdmin, requireOrg } from "~/lib/auth.server";
import { formatJa } from "~/lib/date";
import type { Route } from "./+types/settings";

export function meta(_: Route.MetaArgs) {
  return [{ title: "設定 | おおやさん" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { ctx, session } = await requireOrg(request);
  const isAdmin = session.role === "admin";

  return {
    session,
    isAdmin,
    buildings: await listBuildings(ctx),
    members: await listMembers(ctx),
    invitations: isAdmin ? await listPendingInvitations(ctx) : [],
    origin: new URL(request.url).origin,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { ctx, session } = await requireAdmin(request);
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "invite") {
    await createInvitation(ctx, {
      email: String(form.get("email") ?? ""),
      role: form.get("role") === "admin" ? "admin" : "editor",
      invitedBy: session.user.id,
    });
    return redirect("/settings");
  }

  if (intent === "revoke") {
    await revokeInvitation(ctx, String(form.get("invitationId")));
    return redirect("/settings");
  }

  throw new Response("不明な操作です", { status: 400 });
}

export default function Settings({ loaderData }: Route.ComponentProps) {
  const { session, isAdmin, buildings, members, invitations, origin } = loaderData;

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 pb-16">
      <h1 className="text-2xl font-bold">設定</h1>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-bold">ログイン中</h2>
        <p className="mt-2 text-base">
          {session.user.name}（{session.user.email}）
          <span className="ml-2 rounded-full bg-slate-100 px-3 py-1 text-sm">
            {session.role === "admin" ? "管理者" : "編集者"}
          </span>
        </p>
        <Form method="post" action="/logout" className="mt-4">
          <button
            type="submit"
            className="rounded-lg border border-slate-300 px-4 py-2 text-base hover:bg-slate-100"
          >
            ログアウト
          </button>
        </Form>
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">物件</h2>
          <Link to="/buildings/new" className="text-base font-medium text-sky-700 hover:underline">
            ＋ 建物を追加
          </Link>
        </div>
        {buildings.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-slate-500">
            建物が登録されていません
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {buildings.map((b) => (
              <li key={b.id} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{b.name}</span>
                  {b.address && <span className="block text-sm text-slate-500">{b.address}</span>}
                </span>
                <span className="shrink-0 text-sm text-slate-500 tabular-nums">
                  {b.unitCount}件
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-bold">メンバー</h2>
        <ul className="mt-3 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{m.name}</span>
                <span className="block text-sm text-slate-500">{m.email}</span>
              </span>
              <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-sm">
                {m.role === "admin" ? "管理者" : "編集者"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {isAdmin && (
        <>
          <section className="mt-8">
            <h2 className="text-lg font-bold">招待</h2>
            <p className="mt-1 text-base text-slate-600">
              一般公開の登録はありません。発行したリンクを直接渡してください。
            </p>

            <Form method="post" className="mt-4 space-y-4 rounded-xl border border-slate-200 bg-white p-4">
              <input type="hidden" name="intent" value="invite" />
              <label className="block">
                <span className="text-base font-medium text-slate-700">メールアドレス</span>
                <input
                  type="email"
                  name="email"
                  required
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-lg"
                />
              </label>
              <label className="block">
                <span className="text-base font-medium text-slate-700">権限</span>
                <select
                  name="role"
                  defaultValue="editor"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-lg"
                >
                  <option value="editor">編集者</option>
                  <option value="admin">管理者</option>
                </select>
              </label>
              <button
                type="submit"
                className="w-full rounded-xl bg-sky-600 px-4 py-3 text-lg font-bold text-white hover:bg-sky-700"
              >
                招待リンクを発行
              </button>
            </Form>
          </section>

          {invitations.length > 0 && (
            <section className="mt-6">
              <h3 className="text-base font-bold">未使用の招待</h3>
              <ul className="mt-3 space-y-3">
                {invitations.map((inv) => (
                  <li key={inv.id} className="rounded-xl border border-slate-200 bg-white p-4">
                    <p className="font-medium">{inv.email}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {inv.role === "admin" ? "管理者" : "編集者"} ・ 有効期限{" "}
                      {formatJa(inv.expiresAt.toISOString().slice(0, 10))}
                    </p>
                    <code className="mt-2 block overflow-x-auto rounded-lg bg-slate-100 px-3 py-2 text-sm">
                      {origin}/signup?token={inv.token}
                    </code>
                    <Form method="post" className="mt-2">
                      <input type="hidden" name="intent" value="revoke" />
                      <input type="hidden" name="invitationId" value={inv.id} />
                      <button
                        type="submit"
                        className="text-sm text-slate-500 underline hover:text-slate-800"
                      >
                        この招待を取り消す
                      </button>
                    </Form>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}
