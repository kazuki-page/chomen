import type { IsoDate } from "~/lib/date";

export type MoveInFormValues = {
  tenantName: string;
  birthYear: number | null;
  contractDate: IsoDate;
  rent: number | null;
};

/**
 * 入居手続きの開始フォームを読む。
 *
 * 入口が2つ（部屋詳細・入居画面）あるので、受け取り方も1か所にまとめる。
 * 家賃は必須にしない。契約書が手元に無いまま始めることがあるため。
 */
export function parseMoveInForm(
  form: FormData,
): { ok: true; value: MoveInFormValues } | { ok: false; error: string } {
  const tenantName = String(form.get("tenantName") ?? "").trim();
  const contractDate = String(form.get("contractDate") ?? "");

  if (!tenantName || !contractDate) {
    return { ok: false, error: "氏名と契約日を入力してください" };
  }

  const birthYear = Number(form.get("birthYear"));
  const rent = Number(form.get("rent"));

  return {
    ok: true,
    value: {
      tenantName,
      birthYear: Number.isFinite(birthYear) && birthYear > 0 ? birthYear : null,
      contractDate,
      rent: Number.isFinite(rent) && rent > 0 ? rent : null,
    },
  };
}
