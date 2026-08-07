import { env } from "cloudflare:workers";
import { Form, Link } from "react-router";

import { createDatabase } from "@db/context.server";
import { clientKey, consumeAttempt } from "@db/services/rate-limit.server";
import { getAuth } from "~/lib/auth.server";
import type { Route } from "./+types/forgot-password";

export function meta(_: Route.MetaArgs) {
  return [{ title: "パスワードの再発行 | おおやさん" }];
}

/** 同一IPから 10 分に 5 回まで */
const REQUEST_LIMIT = { max: 5, windowSeconds: 600 };

/**
 * **どの場合も同じ文言を返す。**
 * 登録の有無や権限が応答から読み取れると、それ自体が手がかりになる。
 * 実際に何が起きるか（本人にリンク／管理者に通知／何も起きない）は
 * dispatchPasswordReset 側で決まる。
 */
const DONE_MESSAGE =
  "受け付けました。登録があれば、メールでご案内します。しばらく待っても届かないときは、管理者にご連絡ください。";

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim();

  const limit = await consumeAttempt(createDatabase(env.DB), {
    key: clientKey(request, "forgot-password"),
    ...REQUEST_LIMIT,
  });
  if (!limit.allowed) {
    return {
      done: false,
      error: `試行が多すぎます。${limit.retryAfterSeconds}秒ほど待ってからもう一度お試しください`,
    };
  }

  if (!email) return { done: false, error: "メールアドレスを入力してください" };

  try {
    await getAuth(request).api.requestPasswordReset({ body: { email } });
  } catch {
    // 失敗の内訳は伝えない。送れたかどうかも含めて画面には出さない
  }

  return { done: true, error: null };
}

export default function ForgotPassword({ actionData }: Route.ComponentProps) {
  if (actionData?.done) {
    return (
      <main className="mx-auto max-w-sm px-4 py-12">
        <h1 className="text-2xl font-bold">パスワードの再発行</h1>
        <p className="mt-6 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-4 text-base text-emerald-900">
          {DONE_MESSAGE}
        </p>
        <Link to="/login" className="mt-6 inline-block text-base text-sky-700 underline">
          ログイン画面へ戻る
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-12">
      <h1 className="text-2xl font-bold">パスワードの再発行</h1>
      <p className="mt-3 text-base text-slate-600">
        登録しているメールアドレスを入力してください。
      </p>

      {actionData?.error && (
        <p className="mt-4 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-base text-rose-900">
          {actionData.error}
        </p>
      )}

      <Form method="post" className="mt-6 space-y-4">
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
        <button
          type="submit"
          className="w-full rounded-xl bg-sky-600 px-4 py-4 text-lg font-bold text-white hover:bg-sky-700"
        >
          再発行を依頼する
        </button>
      </Form>

      <Link to="/login" className="mt-6 inline-block text-base text-sky-700 underline">
        ログイン画面へ戻る
      </Link>
    </main>
  );
}
