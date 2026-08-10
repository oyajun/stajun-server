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

  let target = await prisma.user.findUnique({
    where: { id: targetIdParam },
    select: {
      id: true,
      name: true,
      iconEmoji: true,
      iconBackgroundColor: true,
    },
  });

  // 完全一致で見つからない場合、10文字等の prefix（前方一致）での検索を試みる
  if (!target) {
    target = await prisma.user.findFirst({
      where: { id: { startsWith: targetIdParam } },
      select: {
        id: true,
        name: true,
        iconEmoji: true,
        iconBackgroundColor: true,
      },
    });
  }

  // オンボーディング未完了でもプロフィールとして公開する
  if (!target) {
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
    name: target.name || "名無し",
    iconEmoji: target.iconEmoji || "👤",
    iconBackgroundColor: target.iconBackgroundColor || "#CCCCCC",
    isFollowing: follow !== null,
    isStudying: activeSession !== null,
    studyingSince: activeSession?.startedAt ?? null,
  });
}
