import { prisma } from "@/lib/prisma";
import { requireOnboardedUser } from "@/lib/api";

/**
 * GET /api/v1/me/following — フォロー中ユーザー一覧（studying状態は含めない純粋な一覧）
 * 最近フォローした順に返す。
 */
export async function GET(request: Request) {
  const authed = await requireOnboardedUser(request);
  if (authed instanceof Response) return authed;
  const { user } = authed;

  const follows = await prisma.follow.findMany({
    where: { followerId: user.id },
    orderBy: { createdAt: "desc" },
    select: { followingId: true },
  });
  const followingIds = follows.map((f) => f.followingId);

  if (followingIds.length === 0) {
    return Response.json({ users: [] });
  }

  const users = await prisma.user.findMany({
    where: { id: { in: followingIds } },
    select: {
      id: true,
      username: true,
      iconEmoji: true,
      iconBackgroundColor: true,
    },
  });

  // フォロー順（followingIdsの並び）を保つ
  const byId = new Map(users.map((u) => [u.id, u]));
  const ordered = followingIds
    .map((id) => byId.get(id))
    .filter((u): u is (typeof users)[number] => u !== undefined)
    .map((u) => ({
      id: u.id,
      username: u.username,
      iconEmoji: u.iconEmoji ?? null,
      iconBackgroundColor: u.iconBackgroundColor ?? null,
    }));

  return Response.json({ users: ordered });
}
