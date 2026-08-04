/**
 * 画面とサーバーの双方から参照する定数。
 *
 * `*.server.ts` はクライアントバンドルに含められないため、
 * 画面が必要とする値はここに置く。
 */

/**
 * 更新手続きを「やること」に出し始める、予定日の何か月前か。
 *
 * 契約更新は2年周期なので、全部屋ぶんを常時並べるとホーム画面が使い物にならない。
 * これより先の更新は畳んでおき、必要なら開いて辿れるようにする。
 */
export const RENEWAL_LEAD_MONTHS = 6;

/** 家賃改定の事由 */
export const RENT_REASON_LABELS = {
  initial: "新規契約",
  renewal: "更新",
  adjustment: "改定",
} as const;

export type RentReason = keyof typeof RENT_REASON_LABELS;

/** 修繕案件を「放置」とみなす日数 */
export const STALE_THRESHOLD_DAYS = 14;

/**
 * 設備記録の種別。
 *
 * 定型的に「前回いつ・どの型番でやったか」を追いたいものだけを並べる。
 * 突発的な不具合は形が決まらないので、こちらではなく修繕タブで扱う。
 *
 * `hasModel` が false の種別は型番・メーカー欄を出さない（排水管洗浄など）。
 */
export const EQUIPMENT_CATEGORIES = [
  { value: "water_heater", label: "給湯器", hasModel: true },
  { value: "air_conditioner", label: "エアコン", hasModel: true },
  { value: "ih_cooktop", label: "IHコンロ", hasModel: true },
  { value: "bath_fan", label: "浴室換気扇", hasModel: true },
  { value: "kitchen_fan", label: "台所換気扇", hasModel: true },
  { value: "drain_cleaning", label: "排水管洗浄", hasModel: false },
  { value: "other", label: "その他", hasModel: true },
] as const;

export type EquipmentCategory = (typeof EQUIPMENT_CATEGORIES)[number]["value"];

export const EQUIPMENT_CATEGORY_LABELS = Object.fromEntries(
  EQUIPMENT_CATEGORIES.map((c) => [c.value, c.label]),
) as Record<EquipmentCategory, string>;

/** 設備マトリクスのセルを引くためのキー。画面とサーバーの双方で使う */
export const matrixKey = (unitId: string, category: string) => `${unitId}:${category}`;

export function categoryHasModel(value: EquipmentCategory): boolean {
  return EQUIPMENT_CATEGORIES.find((c) => c.value === value)?.hasModel ?? true;
}

/**
 * 設備記録の一括登録で期待する列の順番。
 * 6列目以降は省略できる。書き出し（CSV）も同じ並びにしてあるので往復できる。
 */
export const EQUIPMENT_IMPORT_COLUMNS = [
  "部屋番号",
  "種別",
  "実施日",
  "型番",
  "費用",
  "メーカー（省略可）",
  "メモ（省略可）",
] as const;

/** 契約の一括登録で期待する列の順番。見出し行があれば読み飛ばすが、並び順は固定 */
export const IMPORT_COLUMNS = [
  "部屋番号",
  "氏名",
  "生年",
  "契約日",
  "家賃",
  "次回更新日（省略可）",
  "状態（省略可）",
  "退去日（省略可）",
] as const;

/**
 * 「終了した契約」とみなす状態の書き方。
 * 退去日が入っていれば状態が空でも終了として扱う。
 */
export const ENDED_STATUS_WORDS = ["終了", "退去", "ended", "過去"] as const;

/** 一度に取り込める行数の上限 */
export const MAX_IMPORT_ROWS = 200;

/**
 * 修繕の対応区分。
 *
 * 不具合連絡は管理会社経由で入り、ここで対応先が分岐する。
 * 分岐後にボールの所在が分からなくなるのが最大の課題なので、
 * 工程を細分化せずこの区分と「待ち先」の2点に絞っている。
 */
export const HANDLER_OPTIONS = [
  { value: "self", label: "自分たち" },
  { value: "vendor", label: "業者" },
  { value: "management", label: "管理会社" },
] as const;

export type Handler = (typeof HANDLER_OPTIONS)[number]["value"];

export const HANDLER_LABELS: Record<Handler, string> = {
  self: "自分たち",
  vendor: "業者",
  management: "管理会社",
};

/** 修繕案件のステータス。3つ以上に増やさない（操作者が使わなくなる） */
export const WORK_ORDER_STATUS_OPTIONS = [
  { value: "todo", label: "未対応" },
  { value: "in_progress", label: "対応中" },
  { value: "done", label: "完了" },
] as const;

export type WorkOrderStatus = (typeof WORK_ORDER_STATUS_OPTIONS)[number]["value"];

export const WORK_ORDER_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  todo: "未対応",
  in_progress: "対応中",
  done: "完了",
};
