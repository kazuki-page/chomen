/**
 * 画面とサーバーの双方から参照する定数。
 *
 * `*.server.ts` はクライアントバンドルに含められないため、
 * 画面が必要とする値はここに置く。
 */

/** 修繕案件を「放置」とみなす日数 */
export const STALE_THRESHOLD_DAYS = 14;

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
