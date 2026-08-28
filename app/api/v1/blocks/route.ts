import { prisma } from "@/lib/prisma";
import { annotateUsers, parseIntParam, requireOnboardedUser } from "@/lib/api";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/**
 * GET /api/v1/blocks — 自分がブロックしているユーザー一覧を取得。
 * limit（既定20・最大50）/ offset でページング。
 */
export async function GET(request: Request) {
  const authed = await requireOnboardedUser(request);
  if (authed instanceof Response) return authed;
  const { user } = authed;

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

  const total = await prisma.block.count({
    where: { blockerId: user.id },
  });
  const blocks = await prisma.block.findMany({
    where: { blockerId: user.id },
    orderBy: { createdAt: "desc" },
    select: { blockedId: true },
    skip: offset,
    take: limit,
  });
  const ids = blocks.map((b) => b.blockedId);

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
  
  // ブロック順（blocksの並び）を保つ
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
