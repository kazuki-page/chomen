import { env } from "cloudflare:workers";

/**
 * メール送信（Resend の HTTP API）。
 *
 * Workers は SMTP を扱えず、Cloudflare の Email Routing は受信専用のため、
 * 外部の配信サービスを HTTP で呼ぶ。
 *
 * **失敗しても例外を投げない。** 呼び出し元はパスワード再発行の入口で、
 * ここで throw すると「そのメールアドレスは存在する」ことが応答から漏れる。
 * 送れたかどうかは戻り値で受け取り、画面の文言は成否によらず同じにする。
 */
export type MailResult = { sent: boolean; reason?: string };

export async function sendMail(input: {
  to: string;
  subject: string;
  body: string;
}): Promise<MailResult> {
  const apiKey = env.RESEND_API_KEY;
  const from = env.MAIL_FROM;

  // 未設定でも動くようにしておく（DNS の設定が済むまでは開発中も本番も送れない）
  if (!apiKey || !from) {
    // パスワード再設定の宛先は個人情報なので、運用ログには残さない。
    console.warn("[mail] 未送信: RESEND_API_KEY / MAIL_FROM が未設定");
    return { sent: false, reason: "メールの設定がまだです" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        text: input.body,
      }),
    });

    if (!response.ok) {
      // 本文にはメールアドレスが載るのでログに出さない
      console.error("[mail] 送信に失敗", response.status);
      return { sent: false, reason: `送信に失敗しました（${response.status}）` };
    }

    return { sent: true };
  } catch (error) {
    console.error("[mail] 送信できませんでした", error);
    return { sent: false, reason: "送信できませんでした" };
  }
}
