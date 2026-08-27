/**
 * 手続きのチェック項目テンプレート。
 *
 * 現行 Notion の運用マニュアルの手順をそのまま写したもの。
 * **このアプリの目的は、このマニュアルを人間が覚えなくてよくすること**なので、
 * 項目の文言はマニュアルの語彙から離れないようにする。
 *
 * @see docs/requirements.md 4.3
 */

export type ProcedureType = "move_in" | "renewal" | "move_out";

export type TemplateItem = {
  key: string;
  label: string;
  /** チェックに付随する入力欄の見出し。無い項目はチェックのみ */
  valueLabel?: string;
  hint?: string;
};

export type ProcedureTemplate = {
  label: string;
  items: readonly TemplateItem[];
};

export const PROCEDURE_TEMPLATES: Record<ProcedureType, ProcedureTemplate> = {
  move_in: {
    label: "入居手続き",
    items: [
      { key: "contract_payment_notice", label: "契約金お届け明細を受領" },
      { key: "commission_info", label: "委託手数料支払いに関する情報を受領" },
      { key: "commission_paid", label: "委託手数料の支払いを確認" },
      { key: "contract_filed", label: "契約書をファイリング" },
      { key: "rent_remittance", label: "家賃送金明細を確認" },
    ],
  },
  renewal: {
    label: "更新手続き",
    items: [
      {
        key: "notice_decided",
        label: "更新通知内容を決定",
        valueLabel: "決定日",
        hint: "ここで更新後の家賃が決まります",
      },
      {
        key: "renewal_fee_paid",
        label: "更新料金の支払いを確認",
        valueLabel: "確認した年月",
      },
      {
        key: "commission_paid",
        label: "委託手数料の支払いを確認",
        valueLabel: "確認した年月",
      },
      {
        key: "new_rent_received",
        label: "家賃変更後の金額での入金を確認",
        valueLabel: "確認した年月",
        hint: "家賃を変えていない場合は、空欄のまま完了にしてください",
      },
    ],
  },
  move_out: {
    label: "退居手続き",
    items: [
      { key: "settlement_received", label: "賃貸借契約解除・金銭明細書を受領" },
      { key: "remittance_checked", label: "送金明細を確認" },
    ],
  },
};

export function templateFor(type: ProcedureType): ProcedureTemplate {
  return PROCEDURE_TEMPLATES[type];
}

export function labelForType(type: ProcedureType): string {
  return PROCEDURE_TEMPLATES[type].label;
}
