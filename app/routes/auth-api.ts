import { getAuth } from "~/lib/auth.server";
import type { Route } from "./+types/auth-api";

/** Better Auth のエンドポイント（/api/auth/*） */
export async function loader({ request }: Route.LoaderArgs) {
  return getAuth(request).handler(request);
}

export async function action({ request }: Route.ActionArgs) {
  // 登録は /signup の招待検証を必ず経由させる。Better Auth の標準
  // /sign-up/email を公開すると、招待なしで user レコードだけを作れてしまい、
  // 初回セットアップを妨害できる。
  const path = new URL(request.url).pathname.replace(/\/+$/, "");
  if (path === "/api/auth/sign-up/email") {
    throw new Response("見つかりません", { status: 404 });
  }
  return getAuth(request).handler(request);
}
