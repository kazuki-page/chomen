import { Form, Link, redirect } from "react-router";

import { listEquipmentForUnit } from "@db/repositories/equipment.server";
import { listProceduresForUnit } from "@db/repositories/procedures.server";
import {
  getUnitDetail,
  listRentHistoryForUnit,
  updateListing,
  type RentHistoryRow,
} from "@db/repositories/units.server";
import { listWorkOrders } from "@db/repositories/work-orders.server";
import { updateLeaseDetails } from "@db/services/lease-edit.server";
import { registerExistingLease } from "@db/services/leases.server";
import { startProcedure } from "@db/services/procedures.server";
import { renameUnit } from "@db/services/units.server";
import {
  EQUIPMENT_CATEGORIES,
  RENT_REASON_LABELS,
  WORK_ORDER_STATUS_LABELS,
} from "~/lib/constants";
import { approximateAge, formatJa, formatSlash, todayInTokyo } from "~/lib/date";
import { requireOrg } from "~/lib/auth.server";
import type { Route } from "./+types/unit";

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [{ title: "部屋 | おおやさん" }];
  return [{ title: `${loaderData.unit.code} | おおやさん` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { ctx } = await requireOrg(request);
  const today = todayInTokyo();

  const unit = await getUnitDetail(ctx, params.unitId, { asOf: today });
  if (!unit) throw new Response("見つかりません", { status: 404 });

  const [procedures, workOrders, equipment, rentHistory] = await Promise.all([
    listProceduresForUnit(ctx, unit.id),
    listWorkOrders(ctx, { now: new Date(), unitId: unit.id }),
    listEquipmentForUnit(ctx, unit.id),
    listRentHistoryForUnit(ctx, unit.id),
  ]);

  return { unit, procedures, workOrders, equipment, rentHistory, today };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { ctx } = await requireOrg(request);
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "start_move_out") {
    const unit = await getUnitDetail(ctx, params.unitId, { asOf: todayInTokyo() });
    if (!unit?.lease) throw new Response("契約中ではありません", { status: 400 });

    const procedureId = await startProcedure(ctx, {
      leaseId: unit.lease.id,
      type: "move_out",
      scheduledOn: String(form.get("scheduledOn") || todayInTokyo()),
    });
    return redirect(`/procedures/${procedureId}`);
  }

  if (intent === "edit_lease") {
    const name = String(form.get("tenantName") ?? "").trim();
    const contractDate = String(form.get("contractDate") ?? "");
    if (!name || !contractDate) {
      return { error: "氏名と契約日を入力してください" };
    }

    const birthYear = Number(form.get("birthYear"));
    const rent = Number(form.get("rent"));

    await updateLeaseDetails(ctx, {
      leaseId: String(form.get("leaseId")),
      tenantName: name,
      birthYear: Number.isFinite(birthYear) && birthYear > 0 ? birthYear : null,
      contractDate,
      nextRenewalDate: String(form.get("nextRenewalDate") ?? "") || null,
      rent: Number.isFinite(rent) && rent > 0 ? rent : null,
    });

    return redirect(`/units/${params.unitId}`);
  }

  if (intent === "rename") {
    const result = await renameUnit(ctx, params.unitId, String(form.get("code") ?? ""));
    if (!result.ok) return { error: result.reason };
    return redirect(`/units/${params.unitId}`);
  }

  if (intent === "register_lease") {
    const contractDate = String(form.get("contractDate") ?? "");
    const name = String(form.get("tenantName") ?? "").trim();

    // 家賃は必須にしない。古い契約は金額が残っていないことがある
    if (!name || !contractDate) {
      return { error: "氏名と契約日を入力してください" };
    }

    const birthYear = Number(form.get("birthYear"));
    const rent = Number(form.get("rent"));
    await registerExistingLease(ctx, {
      unitId: params.unitId,
      tenantName: name,
      birthYear: Number.isFinite(birthYear) && birthYear > 0 ? birthYear : null,
      contractDate,
      rent: Number.isFinite(rent) && rent > 0 ? rent : null,
      nextRenewalDate: String(form.get("nextRenewalDate") ?? "") || null,
    });

    return redirect(`/units/${params.unitId}`);
  }

  if (intent === "save_listing") {
    const rent = form.get("listingRent");
    await updateListing(ctx, params.unitId, {
      rent: rent ? Number(rent) : null,
      startedOn: String(form.get("listingStartedOn") || "") || null,
    });
    return redirect(`/units/${params.unitId}`);
  }

  throw new Response("不明な操作です", { status: 400 });
}

export default function Unit({ loaderData, actionData }: Route.ComponentProps) {
  const { unit, procedures, workOrders, equipment, rentHistory, today } = loaderData;

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 pb-16">
      <Link to="/units" className="text-slate-500 hover:underline">
        ← 部屋・駐車場
      </Link>

      {actionData?.error && (
        <p className="mt-3 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-base text-rose-900">
          {actionData.error}
        </p>
      )}

      <header className="mt-3 flex items-center gap-3">
        <h1 className="text-3xl font-bold tabular-nums">{unit.code}</h1>
        {unit.isVacant ? (
          <span className="rounded-full bg-amber-200 px-3 py-1 text-base font-bold text-amber-900">
            空室
          </span>
        ) : (
          <span className="rounded-full bg-slate-200 px-3 py-1 text-base font-medium">入居中</span>
        )}
      </header>

      {unit.lease ? (
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-bold">契約</h2>
          <dl className="mt-3 space-y-2 text-base">
            <Row label="入居者" value={unit.lease.tenantName ?? "—"} />
            <Row
              label="年齢"
              value={(() => {
                const age = approximateAge(unit.lease.tenantBirthYear, today);
                if (age === null) return "生年が未登録";
                return `およそ ${age}歳（${unit.lease.tenantBirthYear}年生）`;
              })()}
            />
            <Row
              label="家賃"
              value={
                unit.lease.rent != null ? `${unit.lease.rent.toLocaleString("ja-JP")}円` : "—"
              }
            />
            <Row label="契約日" value={formatJa(unit.lease.contractDate)} />
            <Row label="次回更新" value={formatJa(unit.lease.nextRenewalDate) || "—"} />
          </dl>

          <EditLeaseForm lease={unit.lease} />
        </section>
      ) : (
        <>
          <RegisterLeaseForm today={today} />
          <ListingForm rent={unit.listingRent} startedOn={unit.listingStartedOn} today={today} />
        </>
      )}

      {unit.lease && <MoveOutForm today={today} />}

      <details className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-lg font-bold">番号を直す</summary>
        <Form method="post" className="mt-4 flex gap-2">
          <input type="hidden" name="intent" value="rename" />
          <input
            type="text"
            name="code"
            required
            defaultValue={unit.code}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-3 text-lg tabular-nums"
          />
          <button
            type="submit"
            className="shrink-0 rounded-lg border-2 border-slate-800 px-4 py-3 text-base font-bold hover:bg-slate-100"
          >
            保存
          </button>
        </Form>
      </details>

      <Section title="手続き">
        {procedures.length === 0 ? (
          <Empty>手続きはありません</Empty>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {procedures.map((p) => (
              <li key={p.id}>
                <Link
                  to={`/procedures/${p.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50"
                >
                  <span className="w-28 shrink-0 text-slate-500">
                    {formatJa(p.scheduledOn) || "—"}
                  </span>
                  <span className="font-medium">{p.typeLabel}</span>
                  <span className="ml-auto text-sm text-slate-500">
                    {p.status === "done" ? "完了" : "進行中"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {rentHistory.length > 0 && (
        <Section title="家賃の履歴">
          <RentHistory rows={rentHistory} />
        </Section>
      )}

      <Section title="設備">
        <EquipmentSection unitId={unit.id} records={equipment} />
      </Section>

      <Section title="修繕">
        {workOrders.length === 0 ? (
          <Empty>修繕の記録はありません</Empty>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {workOrders.map((w) => (
              <li key={w.id}>
                <Link
                  to={`/work-orders/${w.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50"
                >
                  <span className="w-28 shrink-0 text-slate-500">{formatJa(w.occurredOn)}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{w.title}</span>
                  <span className="shrink-0 text-sm text-slate-500">
                    {WORK_ORDER_STATUS_LABELS[w.status]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </main>
  );
}

/**
 * すでに入居している部屋の契約を登録する。
 *
 * 新規入居は「入居手続き」から始まるが、導入時点で入居中の部屋は
 * 手続きを最初から踏めない。そのための移行専用の入口なので、
 * 通常運用で目立たないよう畳んでおく。
 */
function RegisterLeaseForm({ today }: { today: string }) {
  return (
    <details className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer text-lg font-bold">
        すでに入居中の部屋として登録する
      </summary>
      <p className="mt-2 text-base text-slate-600">
        導入時の登録用です。登録すると次回の更新手続きが自動で作られます。
      </p>

      <Form method="post" className="mt-4 space-y-4">
        <input type="hidden" name="intent" value="register_lease" />

        <label className="block">
          <span className="text-base font-medium text-slate-700">入居者の氏名</span>
          <input
            type="text"
            name="tenantName"
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-lg"
          />
        </label>

        <label className="block">
          <span className="text-base font-medium text-slate-700">生年</span>
          <span className="mt-0.5 block text-sm text-slate-500">西暦・任意</span>
          <input
            type="number"
            name="birthYear"
            inputMode="numeric"
            placeholder="1985"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-lg tabular-nums"
          />
        </label>

        <label className="block">
          <span className="text-base font-medium text-slate-700">契約日</span>
          <input
            type="date"
            name="contractDate"
            required
            defaultValue={today}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-lg"
          />
        </label>

        <label className="block">
          <span className="text-base font-medium text-slate-700">現在の家賃（円）</span>
          <span className="mt-0.5 block text-sm text-slate-500">
            任意。分からなければ空のままで構いません
          </span>
          <input
            type="number"
            name="rent"
            inputMode="numeric"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-lg tabular-nums"
          />
        </label>

        <label className="block">
          <span className="text-base font-medium text-slate-700">次回の更新予定日</span>
          <span className="mt-0.5 block text-sm text-slate-500">
            空のままなら契約日の2年後になります
          </span>
          <input
            type="date"
            name="nextRenewalDate"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-lg"
          />
        </label>

        <button
          type="submit"
          className="w-full rounded-xl bg-sky-600 px-4 py-3 text-lg font-bold text-white hover:bg-sky-700"
        >
          契約を登録する
        </button>
      </Form>
    </details>
  );
}

/**
 * 空室の募集内容。
 *
 * 退居手続きの完了時に自動では埋めていない。
 * いくらで募集するかは人が決めることなので、ここで入力してもらう。
 */
function ListingForm({
  rent,
  startedOn,
  today,
}: {
  rent: number | null;
  startedOn: string | null;
  today: string;
}) {
  const notSet = rent === null;

  return (
    <section
      className={`mt-6 rounded-xl border-2 p-4 ${
        notSet ? "border-amber-400 bg-amber-50" : "border-slate-200 bg-white"
      }`}
    >
      <h2 className="text-lg font-bold">募集内容</h2>
      {notSet && (
        <p className="mt-1 text-base text-amber-900">
          募集家賃が未設定です。入力すると一覧と空室リストに表示されます。
        </p>
      )}

      <Form method="post" className="mt-4 space-y-4">
        <input type="hidden" name="intent" value="save_listing" />
        <label className="block">
          <span className="text-base font-medium text-slate-700">募集家賃（円）</span>
          <input
            type="number"
            name="listingRent"
            inputMode="numeric"
            defaultValue={rent ?? ""}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-lg tabular-nums"
          />
        </label>
        <label className="block">
          <span className="text-base font-medium text-slate-700">募集開始日</span>
          <input
            type="date"
            name="listingStartedOn"
            defaultValue={startedOn ?? today}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-lg"
          />
        </label>
        <button
          type="submit"
          className="w-full rounded-xl bg-sky-600 px-4 py-3 text-lg font-bold text-white hover:bg-sky-700"
        >
          保存する
        </button>
      </Form>
    </section>
  );
}

function MoveOutForm({ today }: { today: string }) {
  return (
    <details className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer text-lg font-bold">退居の連絡が来た</summary>
      <Form method="post" className="mt-4 space-y-4">
        <input type="hidden" name="intent" value="start_move_out" />
        <label className="block">
          <span className="text-base font-medium text-slate-700">退居日</span>
          <input
            type="date"
            name="scheduledOn"
            defaultValue={today}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-lg"
          />
        </label>
        <button
          type="submit"
          className="w-full rounded-xl border-2 border-slate-800 px-4 py-3 text-lg font-bold hover:bg-slate-100"
        >
          退居手続きを始める
        </button>
      </Form>
    </details>
  );
}

/**
 * 契約内容の訂正。
 *
 * **入力を間違えたものを直すための機能**であって、契約条件の変更ではない。
 * 家賃の改定は更新手続きから登録され履歴になるので、ここでは新しい履歴を作らず
 * 最新の金額を書き換えるだけ。誤解を招かないよう画面にもその旨を書いておく。
 */
function EditLeaseForm({
  lease,
}: {
  lease: {
    id: string;
    tenantName: string | null;
    tenantBirthYear: number | null;
    contractDate: string;
    nextRenewalDate: string | null;
    rent: number | null;
  };
}) {
  return (
    <details className="mt-4 border-t border-slate-200 pt-3">
      <summary className="cursor-pointer text-base font-medium text-sky-700">
        契約を編集する
      </summary>
      <p className="mt-2 text-sm text-slate-500">
        入力を間違えたときの訂正用です。更新にともなう家賃の改定は、更新手続きから登録してください。
      </p>

      <Form method="post" className="mt-4 space-y-4">
        <input type="hidden" name="intent" value="edit_lease" />
        <input type="hidden" name="leaseId" value={lease.id} />

        <EditField label="入居者の氏名">
          <input
            type="text"
            name="tenantName"
            required
            defaultValue={lease.tenantName ?? ""}
            className="w-full rounded-lg border border-slate-300 px-3 py-3 text-lg"
          />
        </EditField>

        <EditField label="生年" hint="西暦・任意">
          <input
            type="number"
            name="birthYear"
            inputMode="numeric"
            defaultValue={lease.tenantBirthYear ?? ""}
            className="w-full rounded-lg border border-slate-300 px-3 py-3 text-lg tabular-nums"
          />
        </EditField>

        <EditField label="契約日">
          <input
            type="date"
            name="contractDate"
            required
            defaultValue={lease.contractDate}
            className="w-full rounded-lg border border-slate-300 px-3 py-3 text-lg"
          />
        </EditField>

        <EditField label="次回の更新予定日" hint="直すと更新手続きの予定日も一緒に動きます">
          <input
            type="date"
            name="nextRenewalDate"
            defaultValue={lease.nextRenewalDate ?? ""}
            className="w-full rounded-lg border border-slate-300 px-3 py-3 text-lg"
          />
        </EditField>

        <EditField
          label="現在の家賃（円）"
          hint="履歴は増えません。最新の金額を書き換えます。空のままなら今の金額を残します"
        >
          <input
            type="number"
            name="rent"
            inputMode="numeric"
            defaultValue={lease.rent ?? ""}
            className="w-full rounded-lg border border-slate-300 px-3 py-3 text-lg tabular-nums"
          />
        </EditField>

        <button
          type="submit"
          className="w-full rounded-xl bg-sky-600 px-4 py-3 text-lg font-bold text-white hover:bg-sky-700"
        >
          保存する
        </button>
      </Form>
    </details>
  );
}

function EditField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-base font-medium text-slate-700">{label}</span>
      {hint && <span className="mt-0.5 block text-sm text-slate-500">{hint}</span>}
      <div className="mt-1">{children}</div>
    </label>
  );
}

/**
 * 家賃の変遷。**部屋単位**（歴代の入居者を通して）で出す。
 * 空室のときに「前の入居者はいくらだったか」が見えないと募集家賃を決められないため。
 *
 * 増減は1つ前（古い側）のレコードとの差。最初の契約には差が無い。
 */
function RentHistory({ rows }: { rows: RentHistoryRow[] }) {
  return (
    <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
      {rows.map((row, i) => {
        // rows は新しい順。1つ後ろの要素が「前回の家賃」になる
        const previous = rows[i + 1];
        const diff = previous ? row.amount - previous.amount : null;

        return (
          <li key={row.id} className="flex flex-wrap items-baseline gap-x-3 px-4 py-3">
            <span className="w-24 shrink-0 text-slate-500 tabular-nums">
              {formatSlash(row.effectiveFrom)}
            </span>
            <span className="text-lg font-bold tabular-nums">
              {row.amount.toLocaleString("ja-JP")}円
            </span>

            {diff !== null && diff !== 0 && (
              <span
                className={`rounded-full px-2 py-0.5 text-sm font-bold tabular-nums ${
                  diff > 0 ? "bg-rose-100 text-rose-800" : "bg-sky-100 text-sky-800"
                }`}
              >
                {diff > 0 ? "増額" : "減額"} {diff > 0 ? "+" : "−"}
                {Math.abs(diff).toLocaleString("ja-JP")}
              </span>
            )}
            {diff === 0 && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-sm text-slate-600">
                据え置き
              </span>
            )}

            <span className="text-sm text-slate-500">{RENT_REASON_LABELS[row.reason]}</span>
            {!row.confirmed && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-sm font-medium text-amber-800">
                予定
              </span>
            )}
            {row.tenantName && (
              <span className="ml-auto text-sm text-slate-500">{row.tenantName}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * その部屋の設備。種別ごとに「前回」だけを出す。
 * 退去して空室になったときに、交換や排水管洗浄の要否を判断する材料になる。
 */
function EquipmentSection({
  unitId,
  records,
}: {
  unitId: string;
  records: { id: string; category: string; performedOn: string; modelNumber: string | null }[];
}) {
  return (
    <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
      {EQUIPMENT_CATEGORIES.map((c) => {
        const latest = records.find((r) => r.category === c.value);
        return (
          <li key={c.value}>
            <Link
              to={`/equipment/new?unitId=${unitId}&category=${c.value}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50"
            >
              <span className="w-28 shrink-0 font-medium">{c.label}</span>
              {latest ? (
                <>
                  <span className="tabular-nums">{formatJa(latest.performedOn)}</span>
                  {latest.modelNumber && (
                    <span className="min-w-0 truncate text-slate-500">{latest.modelNumber}</span>
                  )}
                </>
              ) : (
                <span className="text-slate-400">記録なし</span>
              )}
              <span className="ml-auto shrink-0 text-sm text-sky-700">＋ 記録</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-slate-500">
      {children}
    </p>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
