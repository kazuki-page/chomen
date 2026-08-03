import { SENIOR_AGE, approximateAge, type IsoDate } from "./date";

export type TenantAgeInput = {
  type: "room" | "parking";
  tenantName: string | null;
  tenantBirthYear: number | null;
};

export type TenantAgeSummary = {
  /** 生年が分かっている人数 */
  known: number;
  /** そのうち SENIOR_AGE 以上の人数 */
  seniors: number;
};

/**
 * 入居者の年齢構成を数える。
 *
 * 数え方に2つの注意点がある。
 *
 * 1. **同じ人を二重に数えない。**
 *    契約を登録するたびに入居者レコードを作っているため、部屋と駐車場の両方を
 *    借りている人は別々のレコードになる。氏名と生年が一致すれば同一人物とみなす。
 *
 * 2. **部屋の契約者だけを数える。**
 *    駐車場だけを借りている人はここに住んでいないので「入居者」ではない。
 *    高齢者の割合を把握する用途なので、実際に住んでいる人に限る。
 */
export function summarizeTenantAges(
  items: TenantAgeInput[],
  today: IsoDate,
): TenantAgeSummary {
  const seen = new Set<string>();
  const ages: number[] = [];

  for (const item of items) {
    if (item.type !== "room") continue;
    if (!item.tenantName) continue;

    const key = `${item.tenantName}|${item.tenantBirthYear ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const age = approximateAge(item.tenantBirthYear, today);
    if (age !== null) ages.push(age);
  }

  return {
    known: ages.length,
    seniors: ages.filter((age) => age >= SENIOR_AGE).length,
  };
}
