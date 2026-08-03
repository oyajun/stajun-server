import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { apiError, parseIntParam, requireOnboardedUser } from "@/lib/api";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const USER_SELECT = {
  id: true,
  name: true,
  iconEmoji: true,
  iconBackgroundColor: true,
} satisfies Prisma.UserSelect;

/**
 * GET /api/v1/users?q=<表示名>&limit=&offset= — 表示名（name）でユーザー検索。
 * 完全一致（大文字小文字は無視）を先頭に、続けて部分一致（曖昧一致）を返す。
 * 各グループ内は name 昇順。自分自身とオンボーディング未完了ユーザーは除外。
 * limit（既定20・最大50）と offset（既定0）でページング。
 */
export async function GET(request: Request) {
  const authed = await requireOnboardedUser(request);
  if (authed instanceof Response) return authed;
  const { user } = authed;

  const params = new URL(request.url).searchParams;
  const q = (params.get("q") ?? "").trim();
  if (q.length === 0) {
    return apiError(400, "INVALID_QUERY", "検索クエリ（q）が必要です。");
  }
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

  // ブロック関係にあるユーザー（自分がブロックしている、または自分をブロックしている）を除外
  const blocks = await prisma.block.findMany({
    where: {
      OR: [{ blockerId: user.id }, { blockedId: user.id }],
    },
    select: { blockerId: true, blockedId: true },
  });
  const excludedIds = [
    user.id,
    ...blocks.map((b) =>
      b.blockerId === user.id ? b.blockedId : b.blockerId
    ),
  ];

  // 完全一致グループと曖昧一致（完全一致を除いた部分一致）グループを分ける。
  // name の contains/equals 条件で NOT NULL＝オンボーディング済みのみが対象。
  const exactWhere: Prisma.UserWhereInput = {
    id: { notIn: excludedIds },
    name: { equals: q, mode: "insensitive" },
  };
  const fuzzyWhere: Prisma.UserWhereInput = {
    id: { notIn: excludedIds },
    name: { contains: q, mode: "insensitive" },
    NOT: { name: { equals: q, mode: "insensitive" } },
  };
  // 論理的な並び順は [完全一致(name昇順) ... 曖昧一致(name昇順)]。
  const orderBy: Prisma.UserOrderByWithRelationInput[] = [
    { name: "asc" },
    { id: "asc" }, // 同名時の安定化（ページ間で並びがぶれないように）
  ];

  const [exactCount, fuzzyCount] = await Promise.all([
    prisma.user.count({ where: exactWhere }),
    prisma.user.count({ where: fuzzyWhere }),
  ]);
  const total = exactCount + fuzzyCount;

  // offset/limit のウィンドウを2グループにまたがって割り当てる
  const rows: Prisma.UserGetPayload<{ select: typeof USER_SELECT }>[] = [];
  if (offset < exactCount) {
    const take = Math.min(limit, exactCount - offset);
    rows.push(
      ...(await prisma.user.findMany({
        where: exactWhere,
        select: USER_SELECT,
        orderBy,
        skip: offset,
        take,
      })),
    );
  }
  const remaining = limit - rows.length;
  if (remaining > 0) {
    const fuzzySkip = Math.max(0, offset - exactCount);
    rows.push(
      ...(await prisma.user.findMany({
        where: fuzzyWhere,
        select: USER_SELECT,
        orderBy,
        skip: fuzzySkip,
        take: remaining,
      })),
    );
  }

  // フォロー状態を一括解決
  const ids = rows.map((u) => u.id);
  const follows = ids.length
    ? await prisma.follow.findMany({
        where: { followerId: user.id, followingId: { in: ids } },
        select: { followingId: true },
      })
    : [];
  const followingSet = new Set(follows.map((f) => f.followingId));

  return Response.json({
    users: rows.map((u) => ({
      id: u.id,
      name: u.name,
      iconEmoji: u.iconEmoji ?? null,
      iconBackgroundColor: u.iconBackgroundColor ?? null,
      isFollowing: followingSet.has(u.id),
    })),
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
    },
  });
}
