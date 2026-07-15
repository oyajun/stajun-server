import { prisma } from "@/lib/prisma";
import { requireOnboardedUser } from "@/lib/api";

/**
 * GET /api/v1/home/feed — フォロー中ユーザー + 各自の学習状態を一括取得（ポーリング対象）
 * 勉強中を先頭に、その中では開始が新しい順。以降はusername昇順。
 */
export async function GET(request: Request) {
  const authed = await requireOnboardedUser(request);
  if (authed instanceof Response) return authed;
  const { user } = authed;

  const follows = await prisma.follow.findMany({
    where: { followerId: user.id },
    select: { followingId: true },
  });
  const followingIds = follows.map((f) => f.followingId);

  if (followingIds.length === 0) {
    return Response.json({ users: [] });
  }

  const [users, activeSessions] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: followingIds } },
      select: {
        id: true,
        username: true,
        iconEmoji: true,
        iconBackgroundColor: true,
      },
    }),
    prisma.studySession.findMany({
      where: { userId: { in: followingIds }, endedAt: null },
      select: { userId: true, startedAt: true },
    }),
  ]);

  // ユーザーごとの最新の勉強開始時刻（複数アクティブがあっても最新を採用）
  const studyingSinceByUser = new Map<string, Date>();
  for (const s of activeSessions) {
    const prev = studyingSinceByUser.get(s.userId);
    if (!prev || s.startedAt > prev) {
      studyingSinceByUser.set(s.userId, s.startedAt);
    }
  }

  const result = users
    .map((u) => {
      const studyingSince = studyingSinceByUser.get(u.id) ?? null;
      return {
        id: u.id,
        username: u.username,
        iconEmoji: u.iconEmoji ?? null,
        iconBackgroundColor: u.iconBackgroundColor ?? null,
        isStudying: studyingSince !== null,
        studyingSince,
      };
    })
    .sort((a, b) => {
      // 勉強中を先頭に
      if (a.isStudying !== b.isStudying) return a.isStudying ? -1 : 1;
      // 勉強中同士は開始が新しい順
      if (a.studyingSince && b.studyingSince) {
        return b.studyingSince.getTime() - a.studyingSince.getTime();
      }
      // それ以外はusername昇順
      return (a.username ?? "").localeCompare(b.username ?? "");
    });

  return Response.json({ users: result });
}
