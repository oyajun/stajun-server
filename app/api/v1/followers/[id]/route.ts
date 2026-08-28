import { prisma } from "@/lib/prisma";
import {
  annotateUsers,
  apiError,
  parseIntParam,
  requireOnboardedUser,
  resolveOnboardedUserId,
} from "@/lib/api";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/**
 * GET /api/v1/followers/:id — :id のフォロワー一覧（最近フォローした順）。
 * limit（既定20・最大50）/ offset でページング。`:id` は `me` 可。
 */
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/v1/followers/[id]">,
) {
  const authed = await requireOnboardedUser(request);
  if (authed instanceof Response) return authed;
  const { user } = authed;

  const { id } = await ctx.params;
  const targetId = await resolveOnboardedUserId(id, user.id);
  if (!targetId) {
    return apiError(404, "USER_NOT_FOUND", "ユーザーが見つかりません。");
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

  const blocks = await prisma.block.findMany({
    where: {
      OR: [{ blockerId: user.id }, { blockedId: user.id }],
    },
    select: { blockerId: true, blockedId: true },
  });
  const excludedIds = blocks.map((b) =>
    b.blockerId === user.id ? b.blockedId : b.blockerId
  );

  const total = await prisma.follow.count({
    where: { followingId: targetId, followerId: { notIn: excludedIds } },
  });
  const follows = await prisma.follow.findMany({
    where: { followingId: targetId, followerId: { notIn: excludedIds } },
    orderBy: { createdAt: "desc" },
    select: { followerId: true },
    skip: offset,
    take: limit,
  });
  const ids = follows.map((f) => f.followerId);

  const rows = ids.length
    ? await prisma.user.findMany({
        where: { id: { in: ids }, name: { not: null } },
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
  // フォロー順（followsの並び）を保つ
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = ids
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
