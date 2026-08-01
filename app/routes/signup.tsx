import { env } from "cloudflare:workers";
import { Form, Link, redirect } from "react-router";

import { createDatabase } from "@db/context.server";
import {
  attachUserToOrganization,
  checkSignupEligibility,
} from "@db/services/invitations.server";
import { cookieHeaders, getAuth } from "~/lib/auth.server";
import type { Route } from "./+types/signup";

export function meta(_: Route.MetaArgs) {
  return [{ title: "アカウント作成 | おおやさん" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const token = new URL(request.url).searchParams.get("token");
  const check = await checkSignupEligibility(createDatabase(env.DB), token);

  return {
    token,
    kind: check.kind,
    email: check.kind === "invited" ? check.email : "",
    reason: check.kind === "invalid" ? check.reason : null,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const token = (form.get("token") as string | null) || null;

  const db = createDatabase(env.DB);
  const check = await checkSignupEligibility(db, token);
  if (check.kind === "invalid") {
    return { error: check.reason };
  }

  const response = await getAuth(request).api.signUpEmail({
    body: {
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    },
    asResponse: true,
  });

  if (!response.ok) {
    return { error: "登録できませんでした。パスワードは8文字以上にしてください" };
  }

  const created = (await response.clone().json()) as { user?: { id?: string } };
  if (!created.user?.id) {
    return { error: "登録できませんでした" };
  }

  await attachUserToOrganization(db, created.user.id, check);

  return redirect("/", { headers: cookieHeaders(response) });
}

export default function Signup({ loaderData, actionData }: Route.ComponentProps) {
  const { kind, token, email, reason } = loaderData;

  if (kind === "invalid") {
    return (
      <main className="mx-auto max-w-sm px-4 py-12">
        <h1 className="text-2xl font-bold">アカウントを作成できません</h1>
        <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-base text-amber-900">
          {reason}
        </p>
        <Link to="/login" className="mt-6 inline-block underline">
          ログインへ
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-12">
      <h1 className="text-2xl font-bold">
        {kind === "bootstrap" ? "初回セットアップ" : "アカウント作成"}
      </h1>
      <p className="mt-2 text-base text-slate-600">
        {kind === "bootstrap"
          ? "最初のアカウントを作ります。このアカウントは管理者になります。"
          : "招待を受け取ったアカウントを作成します。"}
      </p>

      {actionData?.error && (
        <p className="mt-4 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-base text-rose-900">
          {actionData.error}
        </p>
      )}

      <Form method="post" className="mt-6 space-y-4">
        <input type="hidden" name="token" value={token ?? ""} />
        <label className="block">
          <span className="text-base font-medium text-slate-700">お名前</span>
          <input
            type="text"
            name="name"
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-lg"
          />
        </label>
        <label className="block">
          <span className="text-base font-medium text-slate-700">メールアドレス</span>
          <input
            type="email"
            name="email"
            required
            defaultValue={email}
            autoComplete="username"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-lg"
          />
        </label>
        <label className="block">
          <span className="text-base font-medium text-slate-700">パスワード</span>
          <input
            type="password"
            name="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-lg"
          />
          <span className="mt-1 block text-sm text-slate-500">8文字以上</span>
        </label>
        <button
          type="submit"
          className="w-full rounded-xl bg-sky-600 px-4 py-4 text-lg font-bold text-white hover:bg-sky-700"
        >
          作成する
        </button>
      </Form>
    </main>
  );
}
