import { env } from "cloudflare:workers";
import { Form, Link, redirect } from "react-router";

import { createDatabase } from "@db/context.server";
import { clientKey, consumeAttempt, resetAttempts } from "@db/services/rate-limit.server";
import { cookieHeaders, getAppSession, getAuth } from "~/lib/auth.server";
import type { Route } from "./+types/login";

export function meta(_: Route.MetaArgs) {
  return [{ title: "ログイン | 家主の帳面" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  if (await getAppSession(request)) throw redirect("/");
  const params = new URL(request.url).searchParams;
  return { next: params.get("next") ?? "/", justReset: params.get("reset") === "1" };
}

/** 総当たり対策。同一IP × 同一メールで 1 分に 5 回まで */
const LOGIN_LIMIT = { max: 5, windowSeconds: 60 };

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/");

  const db = createDatabase(env.DB);
  const key = clientKey(request, `login:${email.toLowerCase()}`);

  const limit = await consumeAttempt(db, { key, ...LOGIN_LIMIT });
  if (!limit.allowed) {
    return {
      error: `試行が多すぎます。${limit.retryAfterSeconds}秒ほど待ってからもう一度お試しください`,
    };
  }

  const response = await getAuth(request).api.signInEmail({
    body: { email, password },
    asResponse: true,
  });

  if (!response.ok) {
    // 失敗の内訳は伝えない（メールアドレスの存在を推測させないため）
    return { error: "メールアドレスかパスワードが違います" };
  }

  await resetAttempts(db, key);
  return redirect(safeNext(next), { headers: cookieHeaders(response) });
}

/** オープンリダイレクトを防ぐため、同一サイト内のパスだけ許可する */
function safeNext(next: string): string {
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export default function Login({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <main className="mx-auto max-w-sm px-4 py-12">
      <h1 className="text-2xl font-bold">ログイン</h1>

      {loaderData.justReset && (
        <p className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-base text-emerald-900">
          パスワードを変更しました。新しいパスワードでログインしてください
        </p>
      )}

      {actionData?.error && (
        <p className="mt-4 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-base text-rose-900">
          {actionData.error}
        </p>
      )}

      <Form method="post" className="mt-6 space-y-4">
        <input type="hidden" name="next" value={loaderData.next} />
        <label className="block">
          <span className="text-base font-medium text-slate-700">メールアドレス</span>
          <input
            type="email"
            name="email"
            required
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
            autoComplete="current-password"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-lg"
          />
        </label>
        <button
          type="submit"
          className="w-full rounded-xl bg-sky-600 px-4 py-4 text-lg font-bold text-white hover:bg-sky-700"
        >
          ログイン
        </button>
      </Form>

      <p className="mt-6 text-base">
        <Link to="/forgot-password" className="text-sky-700 underline">
          パスワードを忘れた場合
        </Link>
      </p>

      <p className="mt-4 text-sm text-slate-500">
        アカウントは管理者からの招待リンクで作成します。
        <Link to="/signup" className="ml-1 underline">
          初回セットアップ
        </Link>
      </p>
    </main>
  );
}
