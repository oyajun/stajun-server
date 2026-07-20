import { prisma } from "@/lib/prisma";
import {
  apiError,
  formatLocalDate,
  localDayStartUtc,
  parseTzOffset,
  requireOnboardedUser,
  resolveOnboardedUserId,
  startOfBucket,
  toLocalDate,
} from "@/lib/api";

/**
 * GET /api/v1/stats — 勉強時間の集計（累計・今日・今週・今月）。
 * query: userId（`me`可・必須）, tz（`+09:00` 形式・必須）
 *
 * 「今日」「今週」「今月」の区切りは tz（クライアントのUTCオフセット）で決まる。
 * 週は月曜始まり（ISO 8601）。
 * 集計対象は StudyPost.minutes（手動入力の投稿）で、StudySession の経過時間は含まない。
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

  const now = new Date();
  const today = toLocalDate(now, tzOffset);
  const weekStart = startOfBucket(today, "week");
  const monthStart = startOfBucket(today, "month");

  // createdAt はサーバーの now() なので未来の投稿は存在しない。上限の指定は不要。
  const [total, todaySum, weekSum, monthSum, firstPost] = await Promise.all([
    prisma.studyPost.aggregate({
      where: { userId: targetId },
      _sum: { minutes: true },
    }),
    prisma.studyPost.aggregate({
      where: {
        userId: targetId,
        createdAt: { gte: localDayStartUtc(today, tzOffset) },
      },
      _sum: { minutes: true },
    }),
    prisma.studyPost.aggregate({
      where: {
        userId: targetId,
        createdAt: { gte: localDayStartUtc(weekStart, tzOffset) },
      },
      _sum: { minutes: true },
    }),
    prisma.studyPost.aggregate({
      where: {
        userId: targetId,
        createdAt: { gte: localDayStartUtc(monthStart, tzOffset) },
      },
      _sum: { minutes: true },
    }),
    // 年ごとグラフなど「全期間」の開始点をクライアントが決められるように返す
    prisma.studyPost.findFirst({
      where: { userId: targetId },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
  ]);

  return Response.json({
    userId: targetId,
    totalMinutes: total._sum.minutes ?? 0,
    todayMinutes: todaySum._sum.minutes ?? 0,
    weekMinutes: weekSum._sum.minutes ?? 0,
    monthMinutes: monthSum._sum.minutes ?? 0,
    // クライアントが「どの日付で切られたか」を確認できるように返す
    today: formatLocalDate(today),
    weekStart: formatLocalDate(weekStart),
    monthStart: formatLocalDate(monthStart),
    firstPostDate: firstPost
      ? formatLocalDate(toLocalDate(firstPost.createdAt, tzOffset))
      : null,
  });
}
