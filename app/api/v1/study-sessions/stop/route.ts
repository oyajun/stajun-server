import { prisma } from "@/lib/prisma";
import { apiError, requireOnboardedUser } from "@/lib/api";

/**
 * POST /api/v1/study-sessions/stop — 勉強終了
 * アクティブなセッションが無い場合は404。
 */
export async function POST(request: Request) {
  const authed = await requireOnboardedUser(request);
  if (authed instanceof Response) return authed;
  const { user } = authed;

  const active = await prisma.studySession.findFirst({
    where: { userId: user.id, endedAt: null },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  });
  if (!active) {
    return apiError(
      404,
      "NO_ACTIVE_SESSION",
      "アクティブな勉強セッションがありません。",
    );
  }

  const session = await prisma.studySession.update({
    where: { id: active.id },
    data: { endedAt: new Date() },
    select: { id: true, startedAt: true, endedAt: true },
  });

  return Response.json(session);
}
