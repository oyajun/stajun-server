import { prisma } from "@/lib/prisma";
import { apiError, requireOnboardedUser, resolveOnboardedUserId } from "@/lib/api";

export async function PUT(
  request: Request,
  ctx: RouteContext<"/api/v1/block/[id]">
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
    return apiError(400, "INVALID_TARGET", "自分自身をブロックすることはできません。");
  }

  await prisma.$transaction(async (tx) => {
    // ブロックレコードを作成（既にある場合は何もしない）
    await tx.block.upsert({
      where: {
        blockerId_blockedId: { blockerId: user.id, blockedId: targetId },
      },
      update: {},
      create: {
        blockerId: user.id,
        blockedId: targetId,
      },
    });

    // 自分が相手をフォローしている場合、そのフォローを解除する
    await tx.follow.deleteMany({
      where: {
        followerId: user.id,
        followingId: targetId,
      },
    });
  });

  return new Response(null, { status: 204 });
}

export async function DELETE(
  request: Request,
  ctx: RouteContext<"/api/v1/block/[id]">
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
    return apiError(400, "INVALID_TARGET", "自分自身をブロック解除することはできません。");
  }

  await prisma.block.deleteMany({
    where: {
      blockerId: user.id,
      blockedId: targetId,
    },
  });

  return new Response(null, { status: 204 });
}
