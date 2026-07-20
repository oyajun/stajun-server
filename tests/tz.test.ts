import { describe, expect, it } from "vitest";
import {
  addBuckets,
  compareLocalDate,
  formatLocalDate,
  isStatsUnit,
  localDayStartUtc,
  parseLocalDate,
  parseTzOffset,
  startOfBucket,
  toLocalDate,
  type StatsUnit,
} from "@/lib/api";

/** `YYYY-MM-DD` → LocalDate（テスト記述を短くするための糖衣） */
const d = (s: string) => {
  const parsed = parseLocalDate(s);
  if (!parsed) throw new Error(`invalid date in test: ${s}`);
  return parsed;
};

describe("tz helpers", () => {
  it("parseTzOffset", () => {
    expect(parseTzOffset("+09:00")).toBe(540);
    expect(parseTzOffset("+0900")).toBe(540);
    expect(parseTzOffset(" 09:00")).toBe(540); // `+` が空白にデコードされた場合
    expect(parseTzOffset("-05:30")).toBe(-330);
    expect(parseTzOffset("Z")).toBe(0);
    expect(parseTzOffset("+14:00")).toBe(840);
    expect(parseTzOffset("+15:00")).toBeNull();
    expect(parseTzOffset("-13:00")).toBeNull();
    expect(parseTzOffset("+09:70")).toBeNull();
    expect(parseTzOffset("Asia/Tokyo")).toBeNull();
    expect(parseTzOffset(null)).toBeNull();
  });

  it("parseLocalDate", () => {
    expect(parseLocalDate("2026-03-02")).toEqual({ year: 2026, month: 3, day: 2 });
    expect(parseLocalDate("2024-02-29")).toEqual({ year: 2024, month: 2, day: 29 });
    expect(parseLocalDate("2026-02-29")).toBeNull(); // 平年
    expect(parseLocalDate("2026-02-30")).toBeNull();
    expect(parseLocalDate("2026-13-01")).toBeNull();
    expect(parseLocalDate("2026-3-2")).toBeNull();
  });

  it("localDayStartUtc / toLocalDate", () => {
    const d = { year: 2026, month: 3, day: 2 };
    // JST 2026-03-02 00:00 = UTC 2026-03-01 15:00
    expect(localDayStartUtc(d, 540).toISOString()).toBe("2026-03-01T15:00:00.000Z");
    // 翌日境界（to を含めるための排他上限）
    expect(localDayStartUtc(d, 540, 1).toISOString()).toBe("2026-03-02T15:00:00.000Z");
    // 月またぎの繰り上がり
    expect(localDayStartUtc({ year: 2026, month: 3, day: 31 }, 540, 1).toISOString()).toBe(
      "2026-03-31T15:00:00.000Z",
    );

    const at = new Date("2026-03-01T15:30:00Z");
    expect(formatLocalDate(toLocalDate(at, 540))).toBe("2026-03-02"); // JST
    expect(formatLocalDate(toLocalDate(at, 0))).toBe("2026-03-01"); // UTC
    expect(formatLocalDate(toLocalDate(at, -300))).toBe("2026-03-01"); // EST
  });

  it("日跨ぎの連番生成（月末→月初）", () => {
    const from = { year: 2026, month: 2, day: 27 };
    const start = localDayStartUtc(from, 540);
    const days = Array.from({ length: 4 }, (_, i) =>
      formatLocalDate(toLocalDate(new Date(start.getTime() + i * 86_400_000), 540)),
    );
    expect(days).toEqual(["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"]);
  });
});

describe("バケット計算（統計の集計単位）", () => {
  it("isStatsUnit", () => {
    expect(isStatsUnit("day")).toBe(true);
    expect(isStatsUnit("year")).toBe(true);
    expect(isStatsUnit("hour")).toBe(false);
    expect(isStatsUnit(null)).toBe(false);
  });

  it("startOfBucket: 週は月曜始まり", () => {
    // 2026-03-04 は水曜 → その週の月曜は 2026-03-02
    expect(formatLocalDate(startOfBucket(d("2026-03-04"), "week"))).toBe("2026-03-02");
    // 月曜そのものは動かない
    expect(formatLocalDate(startOfBucket(d("2026-03-02"), "week"))).toBe("2026-03-02");
    // 日曜は「その週」の月曜まで戻る（週の最終日）
    expect(formatLocalDate(startOfBucket(d("2026-03-08"), "week"))).toBe("2026-03-02");
    // 月をまたいで戻るケース
    expect(formatLocalDate(startOfBucket(d("2026-03-01"), "week"))).toBe("2026-02-23");
  });

  it("startOfBucket: day / month / year", () => {
    expect(formatLocalDate(startOfBucket(d("2026-03-04"), "day"))).toBe("2026-03-04");
    expect(formatLocalDate(startOfBucket(d("2026-03-04"), "month"))).toBe("2026-03-01");
    expect(formatLocalDate(startOfBucket(d("2026-03-04"), "year"))).toBe("2026-01-01");
  });

  it("addBuckets: 月末・年末の繰り上がり", () => {
    expect(formatLocalDate(addBuckets(d("2026-03-31"), "day", 1))).toBe("2026-04-01");
    expect(formatLocalDate(addBuckets(d("2026-12-29"), "week", 1))).toBe("2027-01-05");
    expect(formatLocalDate(addBuckets(d("2026-12-01"), "month", 1))).toBe("2027-01-01");
    expect(formatLocalDate(addBuckets(d("2026-01-01"), "year", 1))).toBe("2027-01-01");
    expect(formatLocalDate(addBuckets(d("2026-03-01"), "day", -1))).toBe("2026-02-28");
  });

  it("各バケットの最終日（start + 1バケット − 1日）", () => {
    const lastDay = (start: string, unit: StatsUnit) =>
      formatLocalDate(addBuckets(addBuckets(d(start), unit, 1), "day", -1));

    expect(lastDay("2026-03-04", "day")).toBe("2026-03-04");
    expect(lastDay("2026-03-02", "week")).toBe("2026-03-08"); // 月〜日
    expect(lastDay("2026-02-01", "month")).toBe("2026-02-28"); // 平年
    expect(lastDay("2024-02-01", "month")).toBe("2024-02-29"); // うるう年
    expect(lastDay("2026-01-01", "year")).toBe("2026-12-31");
  });

  it("compareLocalDate", () => {
    expect(compareLocalDate(d("2026-03-01"), d("2026-03-02"))).toBeLessThan(0);
    expect(compareLocalDate(d("2026-03-02"), d("2026-03-01"))).toBeGreaterThan(0);
    expect(compareLocalDate(d("2026-03-01"), d("2026-03-01"))).toBe(0);
  });

  it("バケット列挙: 週をまたぐ範囲を月曜区切りで並べる", () => {
    const starts: string[] = [];
    let cursor = startOfBucket(d("2026-03-04"), "week");
    const endExclusive = addBuckets(startOfBucket(d("2026-03-20"), "week"), "week", 1);
    while (compareLocalDate(cursor, endExclusive) < 0) {
      starts.push(formatLocalDate(cursor));
      cursor = addBuckets(cursor, "week", 1);
    }
    expect(starts).toEqual(["2026-03-02", "2026-03-09", "2026-03-16"]);
  });
});
