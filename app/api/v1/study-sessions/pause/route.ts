import { prisma } from "@/lib/prisma";
import { apiError, requireOnboardedUser, studyingSinceThreshold } from "@/lib/api";

/**
 * POST /api/v1/study-sessions/pause — 勉強セッションの一時停止
 * 現在アクティブなセッションを一時停止状態にし、停止までの経過時間を累積秒数に設定する。
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

  // 既に一時停止中なら現在の状態をそのまま返す（べき等）
  if (session.isPaused) {
    return Response.json({
      startedAt: session.startedAt,
      isPaused: true,
      accumulatedSeconds: session.accumulatedSeconds,
    });
  }

  // 開始または再開時刻からの経過秒数を計算し、累積秒数に設定
  const elapsed = Math.max(
    0,
    Math.floor((now.getTime() - session.startedAt.getTime()) / 1000),
  );

  const updated = await prisma.studySession.update({
    where: { userId: user.id },
    data: {
      isPaused: true,
      pausedAt: now,
      accumulatedSeconds: elapsed,
    },
    select: {
      startedAt: true,
      isPaused: true,
      accumulatedSeconds: true,
    },
  });

  return Response.json(updated);
}
