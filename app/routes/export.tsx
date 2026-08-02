import { Link } from "react-router";

import { requireOrg } from "~/lib/auth.server";
import type { Route } from "./+types/export";

export function meta(_: Route.MetaArgs) {
  return [{ title: "書き出し | おおやさん" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireOrg(request);
  return {};
}

export default function Export() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-6 pb-16">
      <h1 className="text-2xl font-bold">書き出し</h1>

      <section className="mt-6">
        <h2 className="text-lg font-bold">印刷する</h2>
        <p className="mt-1 text-base text-slate-600">
          開いてから「印刷する」を押してください。印刷ダイアログで
          <strong>「PDFとして保存」</strong>を選べば PDF になります。
        </p>
        <ul className="mt-3 space-y-3">
          <PrintLink
            to="/print/occupancy"
            title="入居状況一覧"
            description="全部屋の入居者・家賃・次回更新を1〜2枚に"
          />
          <PrintLink
            to="/print/ledger"
            title="部屋台帳"
            description="1部屋1枚。契約・入居履歴・設備・修繕をまとめた保管用"
          />
          <PrintLink
            to="/print/equipment"
            title="設備一覧"
            description="部屋ごとの前回の交換・実施日"
          />
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-bold">CSVで保存する</h2>
        <p className="mt-1 text-base text-slate-600">
          Excel で開けます。契約の列は一括登録と同じ並びなので、
          <strong>書き出して直して読み込み直す</strong>こともできます。
        </p>
        <ul className="mt-3 space-y-3">
          <CsvLink to="/export/leases.csv" title="入居者・契約" description="終了した契約も含みます" />
          <CsvLink to="/export/equipment.csv" title="設備の記録" description="履歴すべて" />
          <CsvLink to="/export/work-orders.csv" title="修繕の履歴" description="全案件" />
        </ul>
      </section>

      <p className="mt-8 rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-600">
        データはいつでもここから全部取り出せます。特定のサービスに閉じ込められることはありません。
      </p>
    </main>
  );
}

function PrintLink({
  to,
  title,
  description,
}: {
  to: string;
  title: string;
  description: string;
}) {
  return (
    <li>
      <Link
        to={to}
        className="block rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-400"
      >
        <span className="block text-lg font-bold">{title}</span>
        <span className="mt-0.5 block text-base text-slate-600">{description}</span>
      </Link>
    </li>
  );
}

function CsvLink({ to, title, description }: { to: string; title: string; description: string }) {
  return (
    <li>
      {/* 素の <a> にするとクライアント遷移せず、そのままダウンロードになる */}
      <a
        href={to}
        className="block rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-400"
      >
        <span className="block text-lg font-bold">{title} ↓</span>
        <span className="mt-0.5 block text-base text-slate-600">{description}</span>
      </a>
    </li>
  );
}
