import { prisma } from "@/lib/prisma";
import {
  isValidActivity,
  readJson,
  requireOnboardedUser,
  studyingSinceThreshold,
} from "@/lib/api";
import { sendToFollowers } from "@/lib/apns";

/**
 * POST /api/v1/study-sessions/start — 勉強開始（勉強中状態をON）
 * upsert（べき等）。既に勉強中（startedAtが24時間以内）の行があれば startedAt を
 * 維持する（オフライン開始の遅延送信を黙って受けるため上書きしない）。
 * 行が無い、または古い行（24時間超＝勉強中扱いでない）なら startedAt を現在時刻にする。
 */
export async function POST(request: Request) {
  const authed = await requireOnboardedUser(request);
  if (authed instanceof Response) return authed;
  const { user } = authed;

  const body = await readJson(request);
  let activity: string | null = null;
  if (body && typeof body === "object" && "activity" in body) {
    const rawActivity = (body as { activity: unknown }).activity;
    if (typeof rawActivity === "string") {
      const trimmed = rawActivity.trim();
      if (trimmed.length > 0 && isValidActivity(trimmed)) {
        activity = trimmed;
      }
    }
  }

  const now = new Date();
  const existing = await prisma.studySession.findUnique({
    where: { userId: user.id },
    select: { startedAt: true, isPaused: true, accumulatedSeconds: true, activity: true },
  });

  // 既に勉強中（24時間以内）ならサーバー側は黙って維持する。
  if (existing && existing.startedAt > studyingSinceThreshold(now)) {
    // もし activity が渡されていて既存と異なる場合は activity のみ更新
    if (activity !== null && activity !== existing.activity) {
      await prisma.studySession.update({
        where: { userId: user.id },
        data: { activity },
      });
    }
    return Response.json({
      startedAt: existing.startedAt,
      isPaused: existing.isPaused,
      accumulatedSeconds: existing.accumulatedSeconds,
      activity: activity ?? existing.activity,
    });
  }

  const session = await prisma.studySession.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      startedAt: now,
      isPaused: false,
      pausedAt: null,
      accumulatedSeconds: 0,
      activity,
    },
    update: {
      startedAt: now,
      isPaused: false,
      pausedAt: null,
      accumulatedSeconds: 0,
      activity,
    }, // 古い行はここで現在時刻に上書き
    select: { startedAt: true, isPaused: true, accumulatedSeconds: true, activity: true },
  });

  // フォロワーへプッシュ通知（レスポンスをブロックしない）
  void sendToFollowers(user.id, user.name ?? "Someone");

  return Response.json({
    startedAt: session.startedAt,
    isPaused: session.isPaused,
    accumulatedSeconds: session.accumulatedSeconds,
    activity: session.activity,
  });
}
