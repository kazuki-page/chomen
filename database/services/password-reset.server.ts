import { eq } from "drizzle-orm";

import { sendMail } from "~/lib/mail.server";
import type { Database } from "../context.server";
import { findMembershipForUser, listAdminEmails } from "../repositories/memberships.server";
import { verification } from "../schema";
import { consumeAttempt } from "./rate-limit.server";

/** 再設定リンクの有効期間 */
export const RESET_TOKEN_TTL_SECONDS = 60 * 60;

/**
 * 同じアカウントについて 1 時間に 1 通まで。
 *
 * IP ごとの制限だけでは、IP を変えられると管理者の受信箱が溢れる。
 * 「誰のアカウントについての依頼か」で数えるのが本命の防御になる。
 */
const PER_ACCOUNT_LIMIT = { max: 1, windowSeconds: RESET_TOKEN_TTL_SECONDS };

/** Better Auth が再設定リンクを検証するときのキー */
export const resetIdentifier = (token: string) => `reset-password:${token}`;

export function resetUrl(baseURL: string, token: string): string {
  return `${baseURL}/reset-password?token=${token}`;
}

/**
 * パスワード再発行の依頼を捌く。**送信先は依頼者とは限らない。**
 *
 *   - 管理者が依頼した … 本人に再設定リンクを送る
 *   - それ以外が依頼した … 管理者に「依頼が来た」と知らせる。リンクは送らない
 *
 * 後者でリンクを同封しないのは、管理者が電話などで本人確認してから
 * 設定画面で発行する、という一手間を残すため。受信箱に他人の合鍵を置かない。
 *
 * **どの経路でも例外を投げず、戻り値も呼び出し元で握りつぶす。**
 * 応答が変わると、そのメールアドレスの登録の有無と権限が漏れる。
 */
export async function dispatchPasswordReset(
  db: Database,
  input: { userId: string; name: string; email: string; token: string; baseURL: string },
): Promise<void> {
  const limit = await consumeAttempt(db, {
    key: `reset:${input.userId}`,
    ...PER_ACCOUNT_LIMIT,
  });
  if (!limit.allowed) return;

  const membership = await findMembershipForUser(db, input.userId);
  if (!membership) return;

  if (membership.role === "admin") {
    await sendMail({
      to: input.email,
      subject: "【家主の帳面】パスワードの再設定",
      body: [
        `${input.name} さん`,
        "",
        "パスワードの再設定を受け付けました。",
        "次のリンクを開いて、新しいパスワードを設定してください。",
        "",
        resetUrl(input.baseURL, input.token),
        "",
        "このリンクは1時間で使えなくなります。",
        "心当たりがない場合は、このメールを破棄してください。",
      ].join("\n"),
    });
    return;
  }

  // 管理者以外には送らない。代わりに管理者へ知らせる
  const admins = await listAdminEmails(db, membership.organizationId);
  for (const admin of admins) {
    await sendMail({
      to: admin.email,
      subject: "【家主の帳面】パスワード再発行の依頼が届いています",
      body: [
        `${admin.name} さん`,
        "",
        `${input.name} さん（${input.email}）から、パスワード再発行の依頼がありました。`,
        "",
        "ご本人に確認のうえ、設定画面から再設定リンクを発行して渡してください。",
        `${input.baseURL}/settings`,
        "",
        "このメールに再設定リンクは含めていません。",
        "心当たりがない場合は、何もせずご本人に確認してください。",
      ].join("\n"),
    });
  }
}

/**
 * 管理者が、他のメンバーのための再設定リンクを発行する。
 *
 * Better Auth が作るものと同じ形式で `verification` に積むので、
 * メール経由で来たリンクと同じ画面・同じ検証を通る。
 */
export async function issueResetToken(db: Database, userId: string): Promise<string> {
  const token = crypto.randomUUID().replaceAll("-", "");
  const now = new Date();

  await db.insert(verification).values({
    id: crypto.randomUUID(),
    identifier: resetIdentifier(token),
    value: userId,
    expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_SECONDS * 1000),
    createdAt: now,
    updatedAt: now,
  });

  return token;
}

/** 発行済みのリンクを無効にする。渡し間違えたときに使う */
export async function revokeResetToken(db: Database, token: string): Promise<void> {
  await db.delete(verification).where(eq(verification.identifier, resetIdentifier(token)));
}
