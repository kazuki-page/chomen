import { describe, expect, it } from "vitest";

import {
  addMonths,
  addYears,
  approximateAge,
  diffInDays,
  monthRange,
  subtractDays,
  todayInTokyo,
} from "./date";

describe("todayInTokyo", () => {
  it("UTCと日付が異なる時間帯でも日本の日付を返す", () => {
    expect(todayInTokyo(new Date("2026-08-01T15:00:00Z"))).toBe("2026-08-02");
  });
});

describe("addYears", () => {
  it("契約日の2年後の同日を返す", () => {
    expect(addYears("2026-08-01", 2)).toBe("2028-08-01");
  });

  it("加算先に2月29日がなければ月末に丸める", () => {
    expect(addYears("2024-02-29", 2)).toBe("2026-02-28");
  });

  it("加算先がうるう年なら2月29日を維持する", () => {
    expect(addYears("2024-02-29", 4)).toBe("2028-02-29");
  });
});

describe("addMonths", () => {
  it("年をまたいで加算する", () => {
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
  });

  it("存在しない月末日は加算先の月末に丸める", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  });

  it("負の月数で前年へ戻れる", () => {
    expect(addMonths("2026-01-31", -2)).toBe("2025-11-30");
  });
});

describe("日付範囲の計算", () => {
  it("うるう年を含む日数差を返す", () => {
    expect(diffInDays("2024-03-01", "2024-02-28")).toBe(2);
  });

  it("指定月の両端を返す", () => {
    expect(monthRange("2024-02-10")).toEqual({
      from: "2024-02-01",
      to: "2024-02-29",
    });
  });

  it("月をまたいで日付を引く", () => {
    expect(subtractDays("2026-03-01", 1)).toBe("2026-02-28");
  });
});

describe("approximateAge", () => {
  it("生年と基準日から概算年齢を返す", () => {
    expect(approximateAge(1960, "2026-08-01")).toBe(66);
  });

  it.each([null, undefined, 0, 2027, 1800])(
    "不明または不正な生年 %s にはnullを返す",
    (birthYear) => {
      expect(approximateAge(birthYear, "2026-08-01")).toBeNull();
    },
  );
});
