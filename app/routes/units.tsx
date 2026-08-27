import { Link } from "react-router";

import { CARD_SURFACE } from "~/components/list-card";

import { listBuildings } from "@db/repositories/buildings.server";
import { listUnits, summarize, type UnitListItem } from "@db/repositories/units.server";
import { SENIOR_AGE, approximateAge, formatJa, todayInTokyo } from "~/lib/date";
import { summarizeTenantAges } from "~/lib/tenant-age";
import { requireOrg } from "~/lib/auth.server";
import type { Route } from "./+types/units";

export function meta(_: Route.MetaArgs) {
  return [{ title: "部屋一覧 | 家主の帳面" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { ctx } = await requireOrg(request);
  const [items, buildings] = await Promise.all([
    listUnits(ctx, { asOf: todayInTokyo() }),
    listBuildings(ctx),
  ]);

  const params = new URL(request.url).searchParams;
  const today = todayInTokyo();

  return {
    items,
    today,
    ageSummary: summarizeTenantAges(items, today),
    summary: summarize(items),
    hasBuilding: buildings.length > 0,
    created: Number(params.get("created")) || 0,
    skipped: Number(params.get("skipped")) || 0,
    imported: Number(params.get("imported")) || 0,
  };
}

export default function Units({ loaderData }: Route.ComponentProps) {
  const { items, summary, hasBuilding, created, skipped, imported, today, ageSummary } =
    loaderData;
  const rooms = items.filter((i) => i.type === "room");
  const parking = items.filter((i) => i.type === "parking");

  if (items.length === 0) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="text-2xl font-bold">部屋・駐車場</h1>
        <div className="mt-6 rounded-xl border-2 border-dashed border-slate-300 px-4 py-8 text-center">
          <p className="text-lg font-medium">まだ部屋が登録されていません</p>
          <p className="mt-2 text-base text-slate-600">
            {hasBuilding
              ? "部屋番号をまとめて作れます。"
              : "はじめに建物を登録します。そのあと部屋番号をまとめて作れます。"}
          </p>
          <Link
            to={hasBuilding ? "/units/new" : "/buildings/new"}
            className="mt-5 inline-block rounded-xl bg-sky-600 px-5 py-3 text-lg font-bold text-white hover:bg-sky-700"
          >
            {hasBuilding ? "部屋を作る" : "建物を登録する"}
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 pb-16">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">部屋・駐車場</h1>
        <div className="flex shrink-0 gap-2">
          <Link
            to="/units/import"
            className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-base font-medium hover:bg-slate-100"
          >
            一括登録
          </Link>
          <Link
            to="/units/new"
            className="rounded-xl bg-sky-600 px-4 py-3 text-base font-bold text-white hover:bg-sky-700"
          >
            ＋ 追加
          </Link>
        </div>
      </div>

      {imported > 0 && (
        <p className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-base text-emerald-900">
          {imported}件の契約を登録しました。次回の更新手続きも作成済みです
        </p>
      )}

      {created > 0 && (
        <p className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-base text-emerald-900">
          {created}件を追加しました
          {skipped > 0 && `（${skipped}件は既にあったため作成していません）`}
        </p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <SummaryCard
          label="部屋"
          total={summary.rooms.total}
          vacant={summary.rooms.vacant}
          unit="室"
        />
        <SummaryCard
          label="駐車場"
          total={summary.parking.total}
          vacant={summary.parking.vacant}
          unit="台"
        />
      </div>

      {ageSummary.known > 0 && (
        <p className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-base">
          <span className="text-slate-500">入居者の年齢</span>
          <span className="ml-3 tabular-nums">
            生年が分かるのは {ageSummary.known}名、うち {SENIOR_AGE}歳以上は{" "}
            <span className="font-bold">{ageSummary.seniors}名</span>
          </span>
        </p>
      )}

      <Section title="部屋">
        {rooms.map((u) => (
          <UnitCard key={u.id} unit={u} today={today} />
        ))}
      </Section>

      <Section title="駐車場">
        {parking.map((u) => (
          <UnitCard key={u.id} unit={u} today={today} />
        ))}
      </Section>
    </main>
  );
}

function SummaryCard({
  label,
  total,
  vacant,
  unit,
}: {
  label: string;
  total: number;
  vacant: number;
  unit: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">
        {total}
        <span className="ml-0.5 text-base font-medium text-slate-500">{unit}</span>
      </p>
      <p className="mt-1 text-sm">
        {vacant > 0 ? (
          <span className="font-semibold text-amber-700">空室 {vacant}</span>
        ) : (
          <span className="text-slate-400">満室</span>
        )}
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-bold text-sky-800">{title}</h2>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">{children}</ul>
    </section>
  );
}

function UnitCard({ unit, today }: { unit: UnitListItem; today: string }) {
  const age = approximateAge(unit.tenantBirthYear, today);
  // 空室でも次が決まっていれば手を打つことは無い。黄色の強調は外す
  const needsTenant = unit.isVacant && unit.upcomingTenantName === null;
  return (
    <li>
      <Link
        to={`/units/${unit.id}`}
        className={`relative block overflow-hidden p-4 pl-5 ${CARD_SURFACE} ${
          needsTenant ? "bg-amber-50" : ""
        }`}
      >
        {/* 色帯は募集が要る空室にだけ付ける。全室に付けると目印にならない */}
        {needsTenant && <span className="absolute inset-y-0 left-0 w-1.5 bg-amber-400" />}
      <div className="flex items-center justify-between gap-3">
        <span className="text-2xl font-bold tabular-nums">{unit.code}</span>
        {unit.isVacant ? (
          <span
            className={`rounded-full px-3 py-1 text-sm font-bold ${
              needsTenant ? "bg-amber-200 text-amber-900" : "bg-slate-200 text-slate-700"
            }`}
          >
            空室
          </span>
        ) : (
          <span className="truncate text-lg text-slate-700">
            {unit.tenantName}
            {age !== null && (
              <span className="ml-1 text-base text-slate-500 tabular-nums">{age}歳</span>
            )}
          </span>
        )}
      </div>

      <dl className="mt-3 space-y-1 text-base">
        <Row
          label={unit.isVacant ? "募集家賃" : "家賃"}
          value={unit.rent != null ? `${unit.rent.toLocaleString("ja-JP")}円` : "—"}
        />
        {unit.isVacant ? (
          <Row label="募集開始" value={formatJa(unit.listingStartedOn) || "—"} />
        ) : (
          <Row label="次回更新" value={formatJa(unit.nextRenewalDate) || "—"} />
        )}
        {/* 退居待ちの部屋では、今の入居者の下に次の入居者が並ぶ */}
        {unit.upcomingTenantName && (
          <Row label="入居予定" value={unit.upcomingTenantName} />
        )}
        </dl>
      </Link>
    </li>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-dashed border-slate-200 pb-1 last:border-0">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="font-bold tabular-nums">{value}</dd>
    </div>
  );
}
