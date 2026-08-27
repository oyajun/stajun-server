import { prisma } from "@/lib/prisma";
import { apiError, requireOnboardedUser } from "@/lib/api";

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

  // ブロック関係のチェック
  if (post.userId !== user.id) {
    const isBlocked = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: user.id, blockedId: post.userId },
          { blockerId: post.userId, blockedId: user.id },
        ],
      },
    });
    if (isBlocked) {
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

  const likeCount = await prisma.postLike.count({
    where: { postId: id },
  });

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

  const likeCount = await prisma.postLike.count({
    where: { postId: id },
  });

  return Response.json({
    likeCount,
    isLiked: false,
  });
}
