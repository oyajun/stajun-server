import { prisma } from "@/lib/prisma";
import { apiError, getBlockingUserIds, requireOnboardedUser } from "@/lib/api";

/**
 * POST /api/v1/posts/:id/like — 投稿にいいねをつける（冪等）。
 * レスポンス: { likeCount: number, isLiked: true }
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const authed = await requireOnboardedUser(request);
  if (authed instanceof Response) return authed;
  const { user } = authed;

  const { id } = await ctx.params;

  const post = await prisma.studyPost.findUnique({
    where: { id },
    select: { id: true, userId: true },
  });

  if (!post) {
    return apiError(404, "POST_NOT_FOUND", "投稿が見つかりません。");
  }

  // 自分が投稿者をブロックしている場合はいいね不可（相手からブロックされている場合は通常通り許可）
  if (post.userId !== user.id) {
    const isBlocking = await prisma.block.findUnique({
      where: {
        blockerId_blockedId: { blockerId: user.id, blockedId: post.userId },
      },
      select: { id: true },
    });
    if (isBlocking) {
      return apiError(404, "POST_NOT_FOUND", "投稿が見つかりません。");
    }
  }

  await prisma.postLike.upsert({
    where: {
      userId_postId: {
        userId: user.id,
        postId: id,
      },
    },
    create: {
      userId: user.id,
      postId: id,
    },
    update: {},
  });

  const [totalLikeCount, blockingIds] = await Promise.all([
    prisma.postLike.count({ where: { postId: id } }),
    getBlockingUserIds(user.id),
  ]);

  const blockedCount = blockingIds.length > 0
    ? await prisma.postLike.count({
        where: { postId: id, userId: { in: blockingIds } },
      })
    : 0;

  const likeCount = Math.max(0, totalLikeCount - blockedCount);

  return Response.json({
    likeCount,
    isLiked: true,
  });
}

/**
 * DELETE /api/v1/posts/:id/like — 投稿のいいねを解除する（冪等）。
 * レスポンス: { likeCount: number, isLiked: false }
 */
export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const authed = await requireOnboardedUser(request);
  if (authed instanceof Response) return authed;
  const { user } = authed;

  const { id } = await ctx.params;

  await prisma.postLike.deleteMany({
    where: {
      userId: user.id,
      postId: id,
    },
  });

  const [totalLikeCount, blockingIds] = await Promise.all([
    prisma.postLike.count({ where: { postId: id } }),
    getBlockingUserIds(user.id),
  ]);

  const blockedCount = blockingIds.length > 0
    ? await prisma.postLike.count({
        where: { postId: id, userId: { in: blockingIds } },
      })
    : 0;

  const likeCount = Math.max(0, totalLikeCount - blockedCount);

  return Response.json({
    likeCount,
    isLiked: false,
  });
}
