import { prisma } from "@/lib/prisma";
import {
  apiError,
  requireOnboardedUser,
  resolveOnboardedUserId,
} from "@/lib/api";
import { sendFollowNotification } from "@/lib/apns";

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

  const existingFollow = await prisma.follow.findUnique({
    where: {
      followerId_followingId: { followerId: user.id, followingId: targetId },
    },
  });

  if (!existingFollow) {
    await prisma.follow.create({
      data: { followerId: user.id, followingId: targetId },
    });

    // 通知レコードを作成（未読）
    const notification = await prisma.notification.create({
      data: {
        userId: targetId,
        actorId: user.id,
        type: "FOLLOW",
        isRead: false,
      },
    });

    // APNs プッシュ通知を送信（レスポンスをブロックしない）
    void sendFollowNotification(
      targetId,
      user.name ?? "",
      user.id,
      notification.id,
    );
  }

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

  // フォロー解除されたら対応する通知レコードも削除
  await prisma.notification.deleteMany({
    where: {
      userId: targetId,
      actorId: user.id,
      type: "FOLLOW",
    },
  });

  return new Response(null, { status: 204 });
}

