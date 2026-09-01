import { env } from "cloudflare:workers";
import { Form, Link, redirect } from "react-router";

import { createDatabase } from "@db/context.server";
import {
  attachUserToOrganization,
  checkSignupEligibility,
} from "@db/services/invitations.server";
import { clientKey, consumeAttempt } from "@db/services/rate-limit.server";
import { cookieHeaders, getAuth } from "~/lib/auth.server";
import type { Route } from "./+types/signup";

export function meta(_: Route.MetaArgs) {
  return [{ title: "アカウント作成 | 家主の帳面" }];
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

/** 招待トークンの総当たり対策。同一IPから 5 分に 10 回まで */
const SIGNUP_LIMIT = { max: 10, windowSeconds: 300 };

async function matchesBootstrapSecret(received: string): Promise<boolean> {
  const configured = (env as typeof env & { BOOTSTRAP_SECRET?: string }).BOOTSTRAP_SECRET ?? "";
  if (!configured || !received) return false;

  const encoder = new TextEncoder();
  const [configuredHash, receivedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(configured)),
    crypto.subtle.digest("SHA-256", encoder.encode(received)),
  ]);

  const left = new Uint8Array(configuredHash);
  const right = new Uint8Array(receivedHash);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i]! ^ right[i]!;
  return difference === 0;
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const token = (form.get("token") as string | null) || null;
  const email = String(form.get("email") ?? "").trim().toLowerCase();

  const db = createDatabase(env.DB);

  const limit = await consumeAttempt(db, {
    key: clientKey(request, "signup"),
    ...SIGNUP_LIMIT,
  });
  if (!limit.allowed) {
    return {
      error: `試行が多すぎます。${limit.retryAfterSeconds}秒ほど待ってからもう一度お試しください`,
    };
  }

  const check = await checkSignupEligibility(db, token);
  if (check.kind === "invalid") {
    return { error: check.reason };
  }
  if (check.kind === "invited" && email !== check.email.trim().toLowerCase()) {
    return { error: "招待されたメールアドレスで登録してください" };
  }
  if (
    check.kind === "bootstrap" &&
    !(await matchesBootstrapSecret(String(form.get("bootstrapSecret") ?? "")))
  ) {
    return { error: "初回セットアップキーが違います" };
  }

  const response = await getAuth(request).api.signUpEmail({
    body: {
      name: String(form.get("name") ?? ""),
      email,
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

  if (!(await attachUserToOrganization(db, created.user.id, check))) {
    // 認証用の user は既に作られているが、組織への所属は一切付与しない。
    // 招待が同時に使われた・取り消された場合に、ログイン状態を渡さない。
    return {
      error:
        check.kind === "bootstrap"
          ? "初回セットアップを完了できませんでした。もう一度やり直してください"
          : "この招待リンクは使用済みか有効期限が切れています",
    };
  }

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
        {kind === "bootstrap" && (
          <label className="block">
            <span className="text-base font-medium text-slate-700">初回セットアップキー</span>
            <input
              type="password"
              name="bootstrapSecret"
              required
              autoComplete="off"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-lg"
            />
          </label>
        )}
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
            readOnly={kind === "invited"}
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
