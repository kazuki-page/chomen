import { createRequestHandler } from "react-router";

import { resetDemoData } from "@db/services/demo-reset.server";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

/**
 * すべてのレスポンスに付けるセキュリティヘッダ。
 *
 * script-src は指定していない。React Router がハイドレーション用の
 * インラインスクリプトを出すため nonce を通す仕組みが必要になる。
 * ここでは nonce 無しで確実に効くものだけを入れている。
 */
const SECURITY_HEADERS: Record<string, string> = {
  // クリックジャッキング対策。他サイトの iframe に埋め込ませない
  "Content-Security-Policy": "frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // 使わない権限は明示的に落とす
  "Permissions-Policy": "geolocation=(), microphone=(), camera=(), payment=()",
  // 次回以降はブラウザ側で HTTPS に固定させる（1年）
  "Strict-Transport-Security": "max-age=31536000",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 平文 HTTP で来たらパスワードが流れる前に HTTPS へ飛ばす。
    // ローカル開発（localhost）は対象外。
    if (url.protocol === "http:" && url.hostname !== "localhost") {
      url.protocol = "https:";
      return Response.redirect(url.toString(), 301);
    }

    const response = await requestHandler(request);

    // Set-Cookie を壊さないよう、既存ヘッダを引き継いだ上で追加する
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      headers.set(name, value);
    }

    // 本番は検索結果に出さない。ログインの向こう側は元々見えないが、
    // ログイン画面が拾われるのも避けたい。
    // デモは逆に見つかってほしいので付けない。
    if (env.DEMO_MODE !== "true") {
      headers.set("X-Robots-Tag", "noindex, nofollow");
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },

  /**
   * デモ環境のデータを毎日初期状態へ戻す（cron の登録は wrangler.jsonc の env.demo）。
   *
   * **DEMO_MODE の確認を外さないこと。** 本番でこれが走るとご両親のデータが消える。
   */
  async scheduled(_controller, env) {
    if (env.DEMO_MODE !== "true") return;

    const result = await resetDemoData(env.DB);
    console.log(
      `demo reset: organization=${result.organizationId} statements=${result.statements}`,
    );
  },
} satisfies ExportedHandler<Env>;
