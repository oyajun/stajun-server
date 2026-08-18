import { prisma } from "@/lib/prisma";
import {
  apiError,
  requireOnboardedUser,
  resolveOnboardedUserId,
} from "@/lib/api";

/** PUT /api/v1/follow/:id/mute — :id の勉強開始通知をミュート（ON） */
export async function PUT(
  request: Request,
  ctx: RouteContext<"/api/v1/follow/[id]/mute">,
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
    return apiError(400, "CANNOT_MUTE_SELF", "自分自身は操作できません。");
  }

  const existingFollow = await prisma.follow.findUnique({
    where: {
      followerId_followingId: { followerId: user.id, followingId: targetId },
    },
  });

  if (!existingFollow) {
    return apiError(404, "NOT_FOLLOWING", "フォローしていません。");
  }

  await prisma.follow.update({
    where: { id: existingFollow.id },
    data: { muteStudyStartNotification: true },
  });

  return Response.json({ isMuted: true });
}

/** DELETE /api/v1/follow/:id/mute — :id の勉強開始通知のミュートを解除（OFF） */
export async function DELETE(
  request: Request,
  ctx: RouteContext<"/api/v1/follow/[id]/mute">,
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
    return apiError(400, "CANNOT_MUTE_SELF", "自分自身は操作できません。");
  }

  const existingFollow = await prisma.follow.findUnique({
    where: {
      followerId_followingId: { followerId: user.id, followingId: targetId },
    },
  });

  if (!existingFollow) {
    return apiError(404, "NOT_FOLLOWING", "フォローしていません。");
  }

  await prisma.follow.update({
    where: { id: existingFollow.id },
    data: { muteStudyStartNotification: false },
  });

  return Response.json({ isMuted: false });
}
