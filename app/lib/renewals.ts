export function formatRentIncreases(increases: { year: string; amount: number; rent: number }[]) {
  return increases.map((r) => `${r.year}年 +${r.amount.toLocaleString("ja-JP")}円（${r.rent.toLocaleString("ja-JP")}円へ）`).join(" ／ ");
}
