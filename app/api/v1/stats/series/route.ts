import {
  addBuckets,
  apiError,
  compareLocalDate,
  formatLocalDate,
  isStatsUnit,
  localDayStartUtc,
  parseLocalDate,
  parseTzOffset,
  requireOnboardedUser,
  resolveOnboardedUserId,
  startOfBucket,
  toLocalDate,
  type LocalDate,
  type StatsUnit,
} from "@/lib/api";
import { prisma } from "@/lib/prisma";

/** 1リクエストで返すバケットの最大数（day で約13ヶ月ぶん）。 */
const MAX_BUCKETS = 400;

/**
 * GET /api/v1/stats/series — 期間を単位ごとに集計した勉強時間の系列。
 * query: userId（`me`可・必須）, tz（`+09:00` 形式・必須）,
 *        unit（day | week | month | year・必須）,
 *        from / to（`YYYY-MM-DD`・必須・どちらも期間に含む）
 *
 * from/to はそれぞれが属するバケットの境界まで外側に広げて返す
 * （例: unit=month, from=2026-01-15 → 2026-01-01 始まりのバケットから）。
 * 投稿の無いバケットも `minutes: 0` で埋めるため、グラフにそのまま流せる。
 * 週は月曜始まり（ISO 8601）。
 */
export async function GET(request: Request) {
  const authed = await requireOnboardedUser(request);
  if (authed instanceof Response) return authed;
  const { user } = authed;

  const params = new URL(request.url).searchParams;

  const userIdParam = params.get("userId");
  if (userIdParam === null) {
    return apiError(400, "INVALID_USER_ID", "userIdを指定してください。");
  }
  const targetId = await resolveOnboardedUserId(userIdParam, user.id);
  if (!targetId) {
    return apiError(404, "USER_NOT_FOUND", "ユーザーが見つかりません。");
  }

  const tzOffset = parseTzOffset(params.get("tz"));
  if (tzOffset === null) {
    return apiError(
      400,
      "INVALID_TZ",
      "tzは`+09:00`のようなUTCオフセットで指定してください。",
    );
  }

  const unit = params.get("unit");
  if (!isStatsUnit(unit)) {
    return apiError(
      400,
      "INVALID_UNIT",
      "unitはday / week / month / yearのいずれかにしてください。",
    );
  }

  const from = parseLocalDate(params.get("from"));
  const to = parseLocalDate(params.get("to"));
  if (!from || !to) {
    return apiError(
      400,
      "INVALID_RANGE",
      "from / to は`YYYY-MM-DD`形式で指定してください。",
    );
  }
  if (compareLocalDate(from, to) > 0) {
    return apiError(400, "INVALID_RANGE", "fromはto以前にしてください。");
  }

  // 指定日が属するバケットを含むように境界を外側へ広げる
  const firstBucket = startOfBucket(from, unit);
  const endExclusive = addBuckets(startOfBucket(to, unit), unit, 1);

  const bucketStarts = collectBucketStarts(firstBucket, endExclusive, unit);
  if (bucketStarts === null) {
    return apiError(
      400,
      "RANGE_TOO_LONG",
      `期間は${unit}単位で最大${MAX_BUCKETS}件までです。`,
    );
  }

  const startUtc = localDayStartUtc(firstBucket, tzOffset);
  const endUtc = localDayStartUtc(endExclusive, tzOffset);

  const posts = await prisma.studyPost.findMany({
    where: { userId: targetId, createdAt: { gte: startUtc, lt: endUtc } },
    select: { minutes: true, createdAt: true },
  });

  // 投稿を「その投稿が属するバケットの開始日」で合算する
  const minutesByBucket = new Map<string, number>();
  for (const p of posts) {
    const localDate = toLocalDate(p.createdAt, tzOffset);
    const key = formatLocalDate(startOfBucket(localDate, unit));
    minutesByBucket.set(key, (minutesByBucket.get(key) ?? 0) + p.minutes);
  }

  const buckets = bucketStarts.map((bucketStart) => {
    const start = formatLocalDate(bucketStart);
    return {
      start,
      // 表示ラベル用に、そのバケットの最終日（含む）も返す
      end: formatLocalDate(addBuckets(addBuckets(bucketStart, unit, 1), "day", -1)),
      minutes: minutesByBucket.get(start) ?? 0,
    };
  });

  return Response.json({
    userId: targetId,
    unit,
    from: formatLocalDate(firstBucket),
    to: formatLocalDate(addBuckets(endExclusive, "day", -1)),
    totalMinutes: buckets.reduce((sum, b) => sum + b.minutes, 0),
    buckets,
  });
}

/**
 * 開始日から終了境界（排他）までのバケット開始日を列挙する。
 * MAX_BUCKETS を超える場合は null（呼び出し側で400にする）。
 */
function collectBucketStarts(
  firstBucket: LocalDate,
  endExclusive: LocalDate,
  unit: StatsUnit,
): LocalDate[] | null {
  const starts: LocalDate[] = [];
  let cursor = firstBucket;
  while (compareLocalDate(cursor, endExclusive) < 0) {
    if (starts.length >= MAX_BUCKETS) return null;
    starts.push(cursor);
    cursor = addBuckets(cursor, unit, 1);
  }
  return starts;
}
