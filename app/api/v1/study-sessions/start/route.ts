import { prisma } from "@/lib/prisma";
import { requireOnboardedUser, studyingSinceThreshold } from "@/lib/api";
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

  const now = new Date();
  const existing = await prisma.studySession.findUnique({
    where: { userId: user.id },
    select: { startedAt: true },
  });

  // 既に勉強中（24時間以内）ならサーバー側は黙って維持する。
  if (existing && existing.startedAt > studyingSinceThreshold(now)) {
    console.log(`[StudySession] User ${user.id} already studying (startedAt=${existing.startedAt.toISOString()}). Skipping notification.`);
    return Response.json({ startedAt: existing.startedAt });
  }

  const session = await prisma.studySession.upsert({
    where: { userId: user.id },
    create: { userId: user.id, startedAt: now },
    update: { startedAt: now }, // 古い行はここで現在時刻に上書き
    select: { startedAt: true },
  });

  console.log(`[StudySession] New session started for user ${user.id}. Dispatching push notifications...`);

  // フォロワーへプッシュ通知（fire-and-forget: 勉強開始ユーザーのレスポンスを待たせない）
  void sendToFollowers(user.id, user.name ?? "Someone").catch((err) => {
    console.error("[StudySession] sendToFollowers error:", err);
  });

  return Response.json({ startedAt: session.startedAt });
}
