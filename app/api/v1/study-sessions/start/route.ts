import { prisma } from "@/lib/prisma";
import { apiError, requireOnboardedUser } from "@/lib/api";

/**
 * POST /api/v1/study-sessions/start — 勉強開始
 * 既にアクティブなセッションがある場合は409（サーバー側で強制終了はしない）。
 */
export async function POST(request: Request) {
  const authed = await requireOnboardedUser(request);
  if (authed instanceof Response) return authed;
  const { user } = authed;

  const active = await prisma.studySession.findFirst({
    where: { userId: user.id, endedAt: null },
    select: { id: true },
  });
  if (active) {
    return apiError(
      409,
      "ALREADY_STUDYING",
      "既に勉強中のセッションがあります。先にstopしてください。",
    );
  }

  const session = await prisma.studySession.create({
    data: { userId: user.id },
    select: { id: true, startedAt: true, endedAt: true },
  });

  return Response.json(session, { status: 201 });
}
