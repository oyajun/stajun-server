import { prisma } from "@/lib/prisma";
import {
  apiError,
  requireOnboardedUser,
  resolveOnboardedUserId,
} from "@/lib/api";

/** PUT /api/v1/follow/:id — :id をフォロー（冪等・承認制なし） */
export async function PUT(
  request: Request,
  ctx: RouteContext<"/api/v1/follow/[id]">,
) {
  const authed = await requireOnboardedUser(request);
  if (authed instanceof Response) return authed;
  const { user } = authed;

  const { id } = await ctx.params;
  const targetId = await resolveOnboardedUserId(id, user.id);
  if (!targetId) {
    return apiError(404, "USER_NOT_FOUND", "ユーザーが見つかりません。");
  }
  if (targetId === user.id) {
    return apiError(400, "CANNOT_FOLLOW_SELF", "自分自身はフォローできません。");
  }

  // 既にフォロー済みでもエラーにせず冪等に扱う
  await prisma.follow.upsert({
    where: {
      followerId_followingId: { followerId: user.id, followingId: targetId },
    },
    create: { followerId: user.id, followingId: targetId },
    update: {},
  });

  return Response.json({ isFollowing: true });
}

/** DELETE /api/v1/follow/:id — :id をフォロー解除（冪等） */
export async function DELETE(
  request: Request,
  ctx: RouteContext<"/api/v1/follow/[id]">,
) {
  const authed = await requireOnboardedUser(request);
  if (authed instanceof Response) return authed;
  const { user } = authed;

  const { id } = await ctx.params;
  const targetId = await resolveOnboardedUserId(id, user.id);
  if (!targetId) {
    return apiError(404, "USER_NOT_FOUND", "ユーザーが見つかりません。");
  }

  // 未フォローでもエラーにしない（deleteManyは0件でも成功）
  await prisma.follow.deleteMany({
    where: { followerId: user.id, followingId: targetId },
  });

  return new Response(null, { status: 204 });
}
