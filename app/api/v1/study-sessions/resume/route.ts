import { prisma } from "@/lib/prisma";
import { apiError, requireOnboardedUser, studyingSinceThreshold } from "@/lib/api";

/**
 * POST /api/v1/study-sessions/resume — 勉強セッションの再開
 * 一時停止中のセッションを再開状態に戻し、累積時間を引き継いだ startedAt を再設定する。
 * プッシュ通知は送信しない。
 */
export async function POST(request: Request) {
  const authed = await requireOnboardedUser(request);
  if (authed instanceof Response) return authed;
  const { user } = authed;

  const now = new Date();
  const session = await prisma.studySession.findUnique({
    where: { userId: user.id },
  });

  if (!session || session.startedAt <= studyingSinceThreshold(now)) {
    return apiError(404, "SESSION_NOT_FOUND", "アクティブな勉強セッションがありません。");
  }

  // 既に勉強中（一時停止中でない）なら現在の状態をそのまま返す（べき等）
  if (!session.isPaused) {
    return Response.json({
      startedAt: session.startedAt,
      isPaused: false,
      accumulatedSeconds: session.accumulatedSeconds,
    });
  }

  // 累積秒数を加味して startedAt を現在時刻から巻き戻した時刻に更新する
  const adjustedStartedAt = new Date(
    now.getTime() - session.accumulatedSeconds * 1000,
  );

  const updated = await prisma.studySession.update({
    where: { userId: user.id },
    data: {
      startedAt: adjustedStartedAt,
      isPaused: false,
      pausedAt: null,
    },
    select: {
      startedAt: true,
      isPaused: true,
      accumulatedSeconds: true,
    },
  });

  return Response.json(updated);
}
