import {
  exportEquipment,
  exportLeases,
  exportWorkOrders,
} from "@db/repositories/export.server";
import { requireOrg } from "~/lib/auth.server";
import {
  EQUIPMENT_CATEGORY_LABELS,
  HANDLER_LABELS,
  WORK_ORDER_STATUS_LABELS,
  type EquipmentCategory,
  type Handler,
  type WorkOrderStatus,
} from "~/lib/constants";
import { csvResponse } from "~/lib/csv";
import { todayInTokyo } from "~/lib/date";
import type { Route } from "./+types/export-csv";

/**
 * CSV の書き出し。`/export/:kind.csv`
 *
 * 契約は一括登録と同じ列順にしてあるので、書き出して直して読み込み直せる。
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const { ctx } = await requireOrg(request);
  const today = todayInTokyo();

  switch (params.kind) {
    case "leases": {
      const rows = await exportLeases(ctx, { asOf: today });
      return csvResponse(`leases-${today}.csv`, [
        ["部屋番号", "氏名", "生年", "契約日", "家賃", "次回更新日", "状態", "退去日"],
        ...rows.map((r) => [
          r.unitCode,
          r.tenantName,
          r.birthYear,
          r.contractDate,
          r.rent,
          r.nextRenewalDate,
          r.status === "active" ? "契約中" : "終了",
          r.endedOn,
        ]),
      ]);
    }

    case "equipment": {
      const rows = await exportEquipment(ctx);
      return csvResponse(`equipment-${today}.csv`, [
        // 一括登録と同じ並び。書き出して直して読み込み直せる
        ["部屋番号", "種別", "実施日", "型番", "費用", "メーカー", "メモ"],
        ...rows.map((r) => [
          r.unitCode,
          EQUIPMENT_CATEGORY_LABELS[r.category as EquipmentCategory] ?? r.category,
          r.performedOn,
          r.modelNumber,
          r.cost,
          r.maker,
          r.note,
        ]),
      ]);
    }

    case "work-orders": {
      const rows = await exportWorkOrders(ctx);
      return csvResponse(`work-orders-${today}.csv`, [
        [
          "部屋番号",
          "場所",
          "件名",
          "内容",
          "発生日",
          "対応区分",
          "待ち先",
          "状態",
          "費用",
          "支払済",
          "完了日",
        ],
        ...rows.map((r) => [
          r.unitCode,
          r.locationNote,
          r.title,
          r.description,
          r.occurredOn,
          r.handler ? (HANDLER_LABELS[r.handler as Handler] ?? r.handler) : "",
          r.waitingOn,
          WORK_ORDER_STATUS_LABELS[r.status as WorkOrderStatus] ?? r.status,
          r.cost,
          r.paid ? "はい" : "",
          r.completedOn,
        ]),
      ]);
    }

    default:
      throw new Response("不明な書き出しです", { status: 404 });
  }
}
