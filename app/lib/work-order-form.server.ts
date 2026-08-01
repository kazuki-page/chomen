import type { WorkOrderInput } from "@db/repositories/work-orders.server";
import {
  HANDLER_OPTIONS,
  WORK_ORDER_STATUS_OPTIONS,
  type Handler,
  type WorkOrderStatus,
} from "~/lib/constants";
import { todayInTokyo } from "~/lib/date";

const HANDLERS = HANDLER_OPTIONS.map((o) => o.value) as readonly string[];
const STATUSES = WORK_ORDER_STATUS_OPTIONS.map((o) => o.value) as readonly string[];

/** フォームの値を検証して修繕案件の入力値に変換する */
export function parseWorkOrderForm(form: FormData): WorkOrderInput {
  const title = text(form.get("title"));
  if (!title) throw new Response("件名を入力してください", { status: 400 });

  const handler = text(form.get("handler"));
  const status = text(form.get("status"));
  const cost = text(form.get("cost"));

  return {
    unitId: text(form.get("unitId")),
    locationNote: text(form.get("locationNote")),
    title,
    description: text(form.get("description")),
    occurredOn: text(form.get("occurredOn")) ?? todayInTokyo(),
    handler: handler && HANDLERS.includes(handler) ? (handler as Handler) : null,
    waitingOn: text(form.get("waitingOn")),
    status: status && STATUSES.includes(status) ? (status as WorkOrderStatus) : "todo",
    cost: cost ? Number(cost) : null,
    paid: form.get("paid") === "1",
  };
}

function text(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
