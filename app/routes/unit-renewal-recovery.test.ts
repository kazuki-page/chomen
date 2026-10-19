import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";

vi.mock("~/lib/auth.server", () => ({ requireOrg: vi.fn() }));
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
import { restoreMissingRenewal } from "@db/services/procedures.server";
import Unit, { action } from "./unit";

beforeEach(() => vi.resetAllMocks());
function request() {
  return new Request("https://example.test/units/u", { method: "POST", body: new URLSearchParams({ intent: "restore_renewal", leaseId: "tampered" }) });
}
it("ログイン組織とURLの部屋だけを復元し再読み込みする", async () => {
  const ctx = { organizationId: "org" };
  vi.mocked(requireOrg).mockResolvedValue({ ctx } as Awaited<ReturnType<typeof requireOrg>>);
  const response = await action({ request: request(), params: { unitId: "u" } } as Parameters<typeof action>[0]);
  expect(restoreMissingRenewal).toHaveBeenCalledWith(ctx, "u");
  expect((response as Response).headers.get("Location")).toBe("/units/u");
});
it("未ログインなら復元しない", async () => {
  const denied = new Response(null, { status: 302 });
  vi.mocked(requireOrg).mockRejectedValue(denied);
  await expect(action({ request: request(), params: { unitId: "u" } } as Parameters<typeof action>[0])).rejects.toBe(denied);
  expect(restoreMissingRenewal).not.toHaveBeenCalled();
});
it("復元可能な場合だけ日付とPOSTボタンを表示する", () => {
  function render(recoveryDate: string | null) {
    const loaderData = {
      unit: { id: "u", code: "301", type: "room", isVacant: false, upcoming: null, lease: { id: "l", tenantName: "架空入居者", tenantBirthYear: null, contractDate: "2020-07-11", nextRenewalDate: "2028-07-11", rent: 40000 } },
      procedures: [], workOrders: [], equipment: [], rentHistory: [], leaseHistory: [], today: "2026-10-19", recoveryDate,
    };
    const router = createMemoryRouter([{ path: "/", element: createElement(Unit, { loaderData } as unknown as Parameters<typeof Unit>[0]) }]);
    return renderToStaticMarkup(createElement(RouterProvider, { router }));
  }
  const html = render("2028-07-11");
  expect(html).toContain("2028年7月11日");
  expect(html).toContain("更新手続きを作り直す");
  expect(html).toContain('method="post"');
  expect(render(null)).not.toContain("更新手続きを作り直す");
});
