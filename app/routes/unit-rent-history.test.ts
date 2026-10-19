import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("~/lib/auth.server", () => ({ requireOrg: vi.fn() }));
vi.mock("@db/repositories/rent-history.server", () => ({ addPastRentRevision: vi.fn(), deleteRentRevision: vi.fn() }));
vi.mock("@db/repositories/renewal-recovery.server", () => ({ getRenewalRecoveryCandidate: vi.fn() }));
vi.mock("@db/repositories/equipment.server", () => ({ listEquipmentForUnit: vi.fn() }));
vi.mock("@db/repositories/procedures.server", () => ({ listProceduresForUnit: vi.fn() }));
vi.mock("@db/repositories/units.server", () => ({ getUnitDetail: vi.fn(), listLeasesForUnit: vi.fn(), listRentHistoryForUnit: vi.fn(), updateListing: vi.fn() }));
vi.mock("@db/repositories/work-orders.server", () => ({ listWorkOrders: vi.fn() }));
vi.mock("@db/services/lease-delete.server", () => ({ deleteLease: vi.fn() }));
vi.mock("@db/services/lease-edit.server", () => ({ updateLeaseDetails: vi.fn() }));
vi.mock("@db/services/leases.server", () => ({ registerExistingLease: vi.fn(), startMoveIn: vi.fn() }));
vi.mock("@db/services/procedures.server", () => ({ restoreMissingRenewal: vi.fn(), startProcedure: vi.fn() }));
vi.mock("@db/services/units.server", () => ({ renameUnit: vi.fn() }));
import { requireOrg } from "~/lib/auth.server";
import { addPastRentRevision, deleteRentRevision } from "@db/repositories/rent-history.server";
import { action } from "./unit";
import { RentHistory } from "~/components/rent-history";
import type { RentHistoryRow, UnitLeaseRow } from "@db/repositories/units.server";

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireOrg).mockResolvedValue({ ctx: { organizationId: "org" } } as Awaited<ReturnType<typeof requireOrg>>);
});
function args(body: Record<string, string>) {
  return { request: new Request("https://example.test/units/u", { method: "POST", body: new URLSearchParams(body) }), params: { unitId: "u" } } as Parameters<typeof action>[0];
}
const add = { intent: "add_rent_history", leaseId: "l", effectiveFrom: "2024-07-11", amount: "40000", reason: "renewal", unitId: "tampered" };
const remove = { intent: "delete_rent_history", revisionId: "r", effectiveFrom: "2024-07-11", amount: "40000", version: "123", confirmedDelete: "yes", unitId: "tampered" };

it("追加は認証済みの組織とURLの部屋に限定し、成功後に再読み込みする", async () => {
  vi.mocked(addPastRentRevision).mockResolvedValue({ ok: true });
  const response = await action(args(add));
  expect(addPastRentRevision).toHaveBeenCalledWith({ organizationId: "org" }, expect.objectContaining({ unitId: "u", leaseId: "l", effectiveFrom: "2024-07-11", amount: "40000", reason: "renewal", now: expect.any(Date) }));
  expect((response as Response).headers.get("Location")).toBe("/units/u?rentHistory=added");
});
it("追加エラーでは入力内容とエラーを返す", async () => {
  vi.mocked(addPastRentRevision).mockResolvedValue({ ok: false, error: "同日の記録があります" });
  expect(await action(args(add))).toEqual({ error: "同日の記録があります", rentHistoryInput: { leaseId: "l", effectiveFrom: "2024-07-11", amount: "40000", reason: "renewal" } });
});
it("削除の明示確認がなければリポジトリを呼ばない", async () => {
  expect(await action(args({ ...remove, confirmedDelete: "" }))).toHaveProperty("error");
  expect(deleteRentRevision).not.toHaveBeenCalled();
});
it("削除は確認した版を部屋スコープ付きで渡す。競合はエラー、成功時は再読込", async () => {
  vi.mocked(deleteRentRevision).mockResolvedValueOnce({ ok: false, error: "記録が変わりました" }).mockResolvedValueOnce({ ok: true });
  expect(await action(args(remove))).toEqual({ error: "記録が変わりました" });
  const response = await action(args(remove));
  expect(deleteRentRevision).toHaveBeenCalledWith({ organizationId: "org" }, { unitId: "u", revisionId: "r", effectiveFrom: "2024-07-11", amount: "40000", version: "123" });
  expect((response as Response).headers.get("Location")).toBe("/units/u?rentHistory=deleted");
});
it("未認証の追加・削除はどちらも実行しない", async () => {
  const denied = new Response(null, { status: 302 });
  vi.mocked(requireOrg).mockRejectedValue(denied);
  for (const body of [add, remove]) await expect(action(args(body))).rejects.toBe(denied);
  expect(addPastRentRevision).not.toHaveBeenCalled();
  expect(deleteRentRevision).not.toHaveBeenCalled();
});

const lease = { id: "l", tenantName: "架空入居者", tenantBirthYear: null, status: "active", contractDate: "2020-07-11", endedOn: null, rent: null, procedureCount: 0 } satisfies UnitLeaseRow;
const row = { id: "r", leaseId: "l", version: 123, canDelete: true, effectiveFrom: "2024-07-11", amount: 40000, reason: "renewal", confirmed: true, tenantName: "架空入居者" } satisfies RentHistoryRow;
function render(rows: RentHistoryRow[], leaseRows: UnitLeaseRow[] = [lease]) {
  const router = createMemoryRouter([{ path: "/", element: createElement(RentHistory, { rows, leases: leaseRows, today: "2026-10-19" }) }]);
  return renderToStaticMarkup(createElement(RouterProvider, { router }));
}
it("家賃不明で履歴0件でも契約を選んで追加でき、未来日を選べない", () => {
  const html = render([], [lease, { ...lease, id: "old", status: "ended", endedOn: "2019-07-10" }, { ...lease, id: "pending", status: "pending" }]);
  expect(html).toContain("過去の家賃を追加");
  expect(html).toContain("家賃の記録はありません");
  expect(html).toContain('value="old"');
  expect(html).not.toContain('value="pending"');
  expect(html).toContain('max="2026-10-19"');
  expect(render([], [])).not.toContain("過去の家賃を追加");
});
it("削除前に対象・影響・元に戻せない旨・必須の確認を表示する", () => {
  const html = render([row]);
  for (const text of ["2024/07/11", "40,000円", "架空入居者", "契約や手続きは残ります", "元に戻せません", 'name="confirmedDelete"', 'name="version" value="123"', 'method="post"']) expect(html).toContain(text);
  expect(html).toMatch(/type="checkbox"[^>]*required/);
  const protectedHtml = render([{ ...row, canDelete: false }]);
  expect(protectedHtml).not.toContain("この記録を削除");
  expect(protectedHtml).toContain("手続き側で確認");
});
it("別契約の家賃や未確定の金額を増額比較の基準にしない", () => {
  const other = { ...row, id: "other", leaseId: "other", effectiveFrom: "2023-07-11", amount: 10000 };
  const planned = { ...row, id: "planned", effectiveFrom: "2022-07-11", amount: 5000, confirmed: false };
  expect(render([row, other, planned])).not.toContain("増額 +");
});
