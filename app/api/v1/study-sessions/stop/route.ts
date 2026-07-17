import { prisma } from "@/lib/prisma";
import { requireOnboardedUser } from "@/lib/api";

/**
 * POST /api/v1/study-sessions/stop — 勉強終了（勉強中状態をOFF）
 * 行を無条件に削除する（他端末のことは気にしない）。
 * 行が無くてもべき等に成功扱い（オフライン終了後の復帰で余分に叩かれ得るため）。
 */
export async function POST(request: Request) {
  const authed = await requireOnboardedUser(request);
  if (authed instanceof Response) return authed;
  const { user } = authed;

  await prisma.studySession.deleteMany({ where: { userId: user.id } });

  return Response.json({ isStudying: false });
}
