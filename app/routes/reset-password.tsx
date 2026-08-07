import { Form, Link, redirect } from "react-router";

import { getAuth } from "~/lib/auth.server";
import type { Route } from "./+types/reset-password";

export function meta(_: Route.MetaArgs) {
  return [{ title: "パスワードの設定 | おおやさん" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  return { token: new URL(request.url).searchParams.get("token") ?? "" };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");

  if (!token) return { error: "リンクが正しくありません" };
  if (password.length < 8) return { error: "パスワードは8文字以上にしてください" };
  if (password !== confirm) return { error: "確認用のパスワードが一致しません" };

  try {
    await getAuth(request).api.resetPassword({ body: { token, newPassword: password } });
  } catch {
    // 期限切れ・使用済み・存在しないトークンをまとめて同じ扱いにする
    return { error: "このリンクは使えません。期限が切れているか、すでに使われています" };
  }

  return redirect("/login?reset=1");
}

export default function ResetPassword({ loaderData, actionData }: Route.ComponentProps) {
  if (!loaderData.token) {
    return (
      <main className="mx-auto max-w-sm px-4 py-12">
        <h1 className="text-2xl font-bold">パスワードの設定</h1>
        <p className="mt-6 rounded-xl border border-rose-300 bg-rose-50 px-4 py-4 text-base text-rose-900">
          リンクが正しくありません。メールのリンクをもう一度開いてください。
        </p>
        <Link to="/forgot-password" className="mt-6 inline-block text-base text-sky-700 underline">
          再発行をやり直す
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-12">
      <h1 className="text-2xl font-bold">パスワードの設定</h1>
      <p className="mt-3 text-base text-slate-600">
        新しいパスワードを決めてください。設定すると、他の端末のログインは切れます。
      </p>

      {actionData?.error && (
        <p className="mt-4 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-base text-rose-900">
          {actionData.error}
        </p>
      )}

      <Form method="post" className="mt-6 space-y-4">
        <input type="hidden" name="token" value={loaderData.token} />
        <label className="block">
          <span className="text-base font-medium text-slate-700">新しいパスワード</span>
          <span className="mt-0.5 block text-sm text-slate-500">8文字以上</span>
          <input
            type="password"
            name="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-lg"
          />
        </label>
        <label className="block">
          <span className="text-base font-medium text-slate-700">確認のため、もう一度</span>
          <input
            type="password"
            name="confirm"
            required
            minLength={8}
            autoComplete="new-password"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-lg"
          />
        </label>
        <button
          type="submit"
          className="w-full rounded-xl bg-sky-600 px-4 py-4 text-lg font-bold text-white hover:bg-sky-700"
        >
          このパスワードにする
        </button>
      </Form>
    </main>
  );
}
