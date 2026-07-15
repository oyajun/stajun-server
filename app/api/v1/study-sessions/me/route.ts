import { prisma } from "@/lib/prisma";
import { requireOnboardedUser } from "@/lib/api";

/** GET /api/v1/study-sessions/me — 自分の現在の学習状態取得 */
export async function GET(request: Request) {
  const authed = await requireOnboardedUser(request);
  if (authed instanceof Response) return authed;
  const { user } = authed;

  const active = await prisma.studySession.findFirst({
    where: { userId: user.id, endedAt: null },
    orderBy: { startedAt: "desc" },
    select: { startedAt: true },
  });

  return Response.json({
    isStudying: active !== null,
    startedAt: active?.startedAt ?? null,
  });
}
