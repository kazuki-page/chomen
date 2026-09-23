import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("~/lib/auth.server", () => ({ requireOrg: vi.fn() }));
vi.mock("@db/repositories/lease-history-repair.server", () => ({ repairRenewalHistory: vi.fn(), listRenewalRepairCandidates: vi.fn() }));
import { requireOrg } from "~/lib/auth.server";
import { repairRenewalHistory, listRenewalRepairCandidates } from "@db/repositories/lease-history-repair.server";
import Repair, { action, loader } from "./renewal-history-repair";

beforeEach(() => vi.resetAllMocks());
function request(confirmed: boolean) {
  const body = new URLSearchParams({ unitId: "u", sourceLeaseId: "old", targetLeaseId: "current" });
  if (confirmed) body.set("confirmedSameOccupancy", "yes");
  return new Request("https://example.test/renewals/history-repair", { method: "POST", body });
}
it("本人確認が無ければ修正処理を呼ばない", async () => {
  vi.mocked(requireOrg).mockResolvedValue({ ctx: {} } as Awaited<ReturnType<typeof requireOrg>>);
  expect(await action({ request: request(false) } as Parameters<typeof action>[0])).toHaveProperty("error");
  expect(repairRenewalHistory).not.toHaveBeenCalled();
});
it("確認した対象だけ修正し、結果を再読込する", async () => {
  const ctx = { organizationId: "org" };
  vi.mocked(requireOrg).mockResolvedValue({ ctx } as Awaited<ReturnType<typeof requireOrg>>);
  vi.mocked(repairRenewalHistory).mockResolvedValue({ ok: true });
  const response = await action({ request: request(true) } as Parameters<typeof action>[0]);
  expect(repairRenewalHistory).toHaveBeenCalledWith(ctx, { unitId: "u", sourceLeaseId: "old", targetLeaseId: "current", now: expect.any(Date) });
  expect(response).toBeInstanceOf(Response);
});
it("未ログインなら候補取得・修正を行わない", async () => {
  vi.mocked(requireOrg).mockRejectedValue(new Response(null, { status: 302 }));
  for (const handler of [action, loader]) await expect(handler({ request: request(true) } as never)).rejects.toBeInstanceOf(Response);
  expect(repairRenewalHistory).not.toHaveBeenCalled();
  expect(listRenewalRepairCandidates).not.toHaveBeenCalled();
});
it("候補なし・成功・エラーを表示する", () => {
  const router = createMemoryRouter([{ path: "/", element: createElement(Repair, {
    loaderData: { candidates: [], repaired: true }, actionData: { error: "修正できません" },
  } as unknown as Parameters<typeof Repair>[0]) }]);
  const html = renderToStaticMarkup(createElement(RouterProvider, { router }));
  expect(html).toContain("該当する候補はありません");
  expect(html).toContain('role="status"');
  expect(html).toContain('role="alert"');
  expect(html).toContain("元に戻せません");
});
