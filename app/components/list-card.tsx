import { Link } from "react-router";

/**
 * 一覧に並ぶカード。ホーム・修繕一覧など、行が「1件の用事」を表す場所で使う。
 *
 * 設計の意図:
 *   - **作業名を主役にする。** 部屋番号ではなく「何をするか」を大きく出す。
 *     一覧を見る目的は場所の確認ではなく、次の行動を決めることなので
 *   - **左端の色帯で種別を示す。** 縦に流し読みしたときに、
 *     文字を読まずに入居／更新／修繕の別が分かる
 *   - **枠線ではなく薄い影で浮かせる。** 枠線だけだと平面に見え、
 *     カードが「区切られた領域」ではなく「線で囲まれた文字」に見える
 *
 * 色だけに意味を持たせない。種別はバッジの文字でも必ず読める。
 */

export type Accent = "navy" | "amber" | "rose" | "slate";

const ACCENT_BAR: Record<Accent, string> = {
  navy: "bg-sky-600",
  amber: "bg-amber-400",
  rose: "bg-rose-400",
  slate: "bg-slate-300",
};

export type Tone = "navy" | "amber" | "rose" | "emerald" | "slate";

const BADGE_TONE: Record<Tone, string> = {
  navy: "bg-sky-50 text-sky-700",
  amber: "bg-amber-50 text-amber-800",
  rose: "bg-rose-50 text-rose-800",
  emerald: "bg-emerald-50 text-emerald-800",
  slate: "bg-slate-100 text-slate-700",
};

/** カードの下地。一覧以外の白いカードとも見た目を揃えるために公開している */
export const CARD_SURFACE =
  "rounded-xl bg-white shadow-sm ring-1 ring-slate-900/5 transition hover:shadow-md";

export function Badge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span
      className={`shrink-0 rounded-lg px-2.5 py-1 text-sm font-bold ${BADGE_TONE[tone]}`}
    >
      {children}
    </span>
  );
}

/** 手続きの進み具合。数字だけより速く読めるよう棒を添える */
export function Progress({ done, total }: { done: number; total: number }) {
  const ratio = total > 0 ? done / total : 0;
  return (
    <span className="flex shrink-0 flex-col items-end gap-1">
      <span className="text-sm font-bold text-sky-700 tabular-nums">
        {done}/{total}
      </span>
      <span className="block h-2 w-20 overflow-hidden rounded-full bg-sky-100">
        <span
          className="block h-full rounded-full bg-sky-600"
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </span>
    </span>
  );
}

export function ListCard({
  to,
  accent,
  badge,
  code,
  right,
  title,
  meta,
  muted = false,
}: {
  to: string;
  accent: Accent;
  badge: { label: string; tone: Tone };
  /** 部屋番号や場所。バッジの隣に小さく添える */
  code: string;
  /** 進捗や警告など、右端に出すもの */
  right?: React.ReactNode;
  title: string;
  meta: React.ReactNode;
  /** 完了済みなど、済んだものを淡くする */
  muted?: boolean;
}) {
  return (
    <li>
      <Link to={to} className={`relative block overflow-hidden p-4 pl-5 ${CARD_SURFACE}`}>
        {/* 左端の色帯。カードの高さいっぱいに伸ばす */}
        <span className={`absolute inset-y-0 left-0 w-1.5 ${ACCENT_BAR[accent]}`} />

        <div className="flex items-start gap-3">
          <Badge tone={badge.tone}>{badge.label}</Badge>
          <span className="min-w-0 truncate pt-1 text-base font-bold text-slate-500 tabular-nums">
            {code}
          </span>
          {right && <span className="ml-auto">{right}</span>}
        </div>

        <p
          className={`mt-2 text-xl font-bold ${muted ? "text-slate-400 line-through" : "text-slate-900"}`}
        >
          {title}
        </p>
        <p className="mt-1 flex flex-wrap gap-x-2 text-sm text-slate-500">{meta}</p>
      </Link>
    </li>
  );
}
