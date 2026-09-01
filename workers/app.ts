import { createRequestHandler } from "react-router";

import { resetDemoData } from "@db/services/demo-reset.server";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

/**
 * すべてのレスポンスに付けるセキュリティヘッダ。
 *
 * CSP の nonce は fetch ごとに生成し、root route 経由で React Router の
 * スクリプトにも渡す。これによりハイドレーションを壊さず、注入された
 * スクリプトの実行を防ぐ。
 */
const SECURITY_HEADERS: Record<string, string> = {
  // クリックジャッキング対策。他サイトの iframe に埋め込ませない
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // 使わない権限は明示的に落とす
  "Permissions-Policy": "geolocation=(), microphone=(), camera=(), payment=()",
  // 次回以降はブラウザ側で HTTPS に固定させる（1年）
  "Strict-Transport-Security": "max-age=31536000",
};

const CSP_NONCE_HEADER = "x-chomen-csp-nonce";

function contentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 平文 HTTP で来たらパスワードが流れる前に HTTPS へ飛ばす。
    // ローカル開発（localhost）は対象外。
    if (url.protocol === "http:" && url.hostname !== "localhost") {
      url.protocol = "https:";
      return Response.redirect(url.toString(), 301);
    }

    const nonce = crypto.randomUUID();
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(CSP_NONCE_HEADER, nonce);
    const response = await requestHandler(new Request(request, { headers: requestHeaders }));

    // Set-Cookie を壊さないよう、既存ヘッダを引き継いだ上で追加する
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      headers.set(name, value);
    }
    headers.set("Content-Security-Policy", contentSecurityPolicy(nonce));

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
