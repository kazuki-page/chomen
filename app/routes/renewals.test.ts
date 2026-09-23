import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";

vi.mock("~/lib/auth.server", () => ({ requireOrg: vi.fn() }));
vi.mock("@db/repositories/renewals.server", () => ({ listRenewals: vi.fn() }));
vi.mock("@db/repositories/export.server", () => ({ getPrimaryBuilding: vi.fn() }));
import { requireOrg } from "~/lib/auth.server";
import { listRenewals } from "@db/repositories/renewals.server";
import Renewals, { loader } from "./renewals";
import PrintRenewals, { loader as printLoader } from "./print-renewals";
import { loader as csvLoader } from "./export-csv";

const items = [{ procedureId: "p", leaseId: "l", renewalDate: "2026-10-01", unitCode: "101", tenantName: "架空入居者", rentBefore: 83000, increases: [{ year: "2024", amount: 3000, rent: 83000 }] }];
beforeEach(() => vi.resetAllMocks());

it("一覧と印刷に必要な項目・増額と年・手続きへのリンクを描画する", () => {
  const list = renderToStaticMarkup(createElement(MemoryRouter, null,
    createElement(Renewals, { loaderData: { items } } as Parameters<typeof Renewals>[0])));
  const print = renderToStaticMarkup(createElement(MemoryRouter, null,
    createElement(PrintRenewals, { loaderData: { items, building: { name: "架空建物", address: null }, today: "2026-09-23" } } as Parameters<typeof PrintRenewals>[0])));
  for (const html of [list, print]) {
    for (const text of ["101", "架空入居者", "83,000円", "2024年 +3,000円", "更新前の家賃"]) expect(html).toContain(text);
  }
  expect(list).toContain('href="/procedures/p"');
  expect(list).toContain('href="/print/renewals"');
  expect(print).toContain("印刷する");
});

it("空一覧と金額不明を表示する", () => {
  const render = (data: typeof items) => renderToStaticMarkup(createElement(MemoryRouter, null,
    createElement(Renewals, { loaderData: { items: data } } as Parameters<typeof Renewals>[0])));
  expect(render([])).toContain("これから行う更新はありません。");
  const html = render([{ ...items[0], rentBefore: null, increases: [] }] as unknown as typeof items);
  expect(html).toContain("不明");
  expect(html).toContain("確認できる記録なし");
});

it("CSVも同じ組織の共通データから更新情報をダウンロードとして返す", async () => {
  const ctx = { organizationId: "org-a" };
  vi.mocked(requireOrg).mockResolvedValue({ ctx } as Awaited<ReturnType<typeof requireOrg>>);
  vi.mocked(listRenewals).mockResolvedValue(items);
  const response = await csvLoader({ request: new Request("https://example.test/export/renewals.csv"), params: { kind: "renewals" } } as Parameters<typeof csvLoader>[0]);
  expect(listRenewals).toHaveBeenCalledWith(ctx);
  expect(response.headers.get("content-disposition")).toContain("attachment;");
  const csv = await response.text();
  expect(csv).toContain("2026-10-01,101,架空入居者,83000");
  expect(csv).toContain("2024年 +3,000円（83,000円へ）");
});

it("一覧・印刷・CSVは認証失敗時に業務データを取得しない", async () => {
  const denied = new Response(null, { status: 302, headers: { Location: "/login" } });
  vi.mocked(requireOrg).mockRejectedValue(denied);
  for (const run of [loader, printLoader, csvLoader]) {
    await expect(run({ request: new Request("https://example.test/renewals"), params: { kind: "renewals" } } as never)).rejects.toBe(denied);
  }
  expect(listRenewals).not.toHaveBeenCalled();
});
