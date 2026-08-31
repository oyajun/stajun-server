import { prisma } from "@/lib/prisma";
import {
  annotateUsers,
  apiError,
  getBlockedUserIds,
  parseIntParam,
  requireOnboardedUser,
} from "@/lib/api";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/**
 * GET /api/v1/posts/:id/likes — 投稿にいいねしたユーザー一覧（最近いいねした順）。
 * limit（既定20・最大50）/ offset でページング。
 */
export async function GET(
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

  // 投稿者とのブロック関係チェック
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

  const params = new URL(request.url).searchParams;
  const limit = parseIntParam(params.get("limit"), {
    fallback: DEFAULT_LIMIT,
    min: 1,
    max: MAX_LIMIT,
  });
  const offset = parseIntParam(params.get("offset"), {
    fallback: 0,
    min: 0,
    max: Number.MAX_SAFE_INTEGER,
  });

  const excludedIds = await getBlockedUserIds(user.id);

  const total = await prisma.postLike.count({
    where: { postId: id, userId: { notIn: excludedIds } },
  });

  const postLikes = await prisma.postLike.findMany({
    where: { postId: id, userId: { notIn: excludedIds } },
    orderBy: { createdAt: "desc" },
    select: { userId: true },
    skip: offset,
    take: limit,
  });

  const likerIds = postLikes.map((pl) => pl.userId);

  const rows = likerIds.length
    ? await prisma.user.findMany({
        where: { id: { in: likerIds }, name: { not: null } },
        select: {
          id: true,
          name: true,
          iconEmoji: true,
          iconBackgroundColor: true,
          isPro: true,
          proExpiresAt: true,
        },
      })
    : [];

  // いいね順（postLikes の並び）を保持
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = likerIds
    .map((i) => byId.get(i))
    .filter((r): r is (typeof rows)[number] => r !== undefined);

  const users = await annotateUsers(user.id, ordered);

  return Response.json({
    users,
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + ordered.length < total,
    },
  });
}
