import { prisma } from "@/lib/prisma";
import {
  apiError,
  requireOnboardedUser,
  resolveUserIdParam,
  studyingSinceThreshold,
} from "@/lib/api";

/** GET /api/v1/users/:id — 他ユーザーの公開プロフィール取得（idで取得・`me`可） */
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/v1/users/[id]">,
) {
  const authed = await requireOnboardedUser(request);
  if (authed instanceof Response) return authed;
  const { user } = authed;

  const { id } = await ctx.params;
  const targetIdParam = resolveUserIdParam(id, user.id);

  const target = await prisma.user.findUnique({
    where: { id: targetIdParam },
    select: {
      id: true,
      username: true,
      iconEmoji: true,
      iconBackgroundColor: true,
    },
  });
  // オンボーディング未完了（username IS NULL）のユーザーは公開対象外として404扱い
  if (!target || !target.username) {
    return apiError(404, "USER_NOT_FOUND", "ユーザーが見つかりません。");
  }

  const [follow, activeSession] = await Promise.all([
    prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: user.id,
          followingId: target.id,
        },
      },
      select: { id: true },
    }),
    prisma.studySession.findFirst({
      where: { userId: target.id, startedAt: { gt: studyingSinceThreshold() } },
      select: { startedAt: true },
    }),
  ]);

  return Response.json({
    id: target.id,
    username: target.username,
    iconEmoji: target.iconEmoji ?? null,
    iconBackgroundColor: target.iconBackgroundColor ?? null,
    isFollowing: follow !== null,
    isStudying: activeSession !== null,
    studyingSince: activeSession?.startedAt ?? null,
  });
}
