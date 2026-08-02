import { Link } from "react-router";

import { listBuildings } from "@db/repositories/buildings.server";
import { listUnits, summarize, type UnitListItem } from "@db/repositories/units.server";
import { formatJa, todayInTokyo } from "~/lib/date";
import { requireOrg } from "~/lib/auth.server";
import type { Route } from "./+types/units";

export function meta(_: Route.MetaArgs) {
  return [{ title: "部屋一覧 | おおやさん" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { ctx } = await requireOrg(request);
  const [items, buildings] = await Promise.all([
    listUnits(ctx, { asOf: todayInTokyo() }),
    listBuildings(ctx),
  ]);

  const params = new URL(request.url).searchParams;
  return {
    items,
    summary: summarize(items),
    hasBuilding: buildings.length > 0,
    created: Number(params.get("created")) || 0,
    skipped: Number(params.get("skipped")) || 0,
  };
}

export default function Units({ loaderData }: Route.ComponentProps) {
  const { items, summary, hasBuilding, created, skipped } = loaderData;
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
        <Link
          to="/units/new"
          className="rounded-xl bg-sky-600 px-4 py-3 text-base font-bold text-white hover:bg-sky-700"
        >
          ＋ 追加
        </Link>
      </div>

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

      <Section title="部屋">
        {rooms.map((u) => (
          <UnitCard key={u.id} unit={u} />
        ))}
      </Section>

      <Section title="駐車場">
        {parking.map((u) => (
          <UnitCard key={u.id} unit={u} />
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
      <h2 className="text-lg font-bold">{title}</h2>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">{children}</ul>
    </section>
  );
}

function UnitCard({ unit }: { unit: UnitListItem }) {
  return (
    <li>
      <Link
        to={`/units/${unit.id}`}
        className={`block rounded-xl border p-4 hover:border-slate-400 ${
          unit.isVacant ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"
        }`}
      >
      <div className="flex items-center justify-between gap-3">
        <span className="text-2xl font-bold tabular-nums">{unit.code}</span>
        {unit.isVacant ? (
          <span className="rounded-full bg-amber-200 px-3 py-1 text-sm font-bold text-amber-900">
            空室
          </span>
        ) : (
          <span className="truncate text-lg text-slate-700">{unit.tenantName}</span>
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
        </dl>
      </Link>
    </li>
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
