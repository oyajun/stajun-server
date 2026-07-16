import { prisma } from "@/lib/prisma";
import {
  annotateUsers,
  apiError,
  requireOnboardedUser,
  resolveOnboardedUserId,
} from "@/lib/api";

/**
 * GET /api/v1/following/:id — :id がフォロー中のユーザー一覧。
 * 各ユーザーに勉強中フラグ（isStudying/studyingSince）を付け、勉強中を先頭にソートして返す。
 * `:id` は `me` 可で、`following/me` はホーム画面のプレゼンス（ポーリング対象）に使う。
 * プレゼンス用途のため全件返す（ページングなし）。
 */
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/v1/following/[id]">,
) {
  const authed = await requireOnboardedUser(request);
  if (authed instanceof Response) return authed;
  const { user } = authed;

  const { id } = await ctx.params;
  const targetId = await resolveOnboardedUserId(id, user.id);
  if (!targetId) {
    return apiError(404, "USER_NOT_FOUND", "ユーザーが見つかりません。");
  }

  const follows = await prisma.follow.findMany({
    where: { followerId: targetId },
    select: { followingId: true },
  });
  const ids = follows.map((f) => f.followingId);
  if (ids.length === 0) {
    return Response.json({ users: [] });
  }

  const rows = await prisma.user.findMany({
    where: { id: { in: ids }, username: { not: null } },
    select: {
      id: true,
      username: true,
      iconEmoji: true,
      iconBackgroundColor: true,
    },
  });

  const users = await annotateUsers(user.id, rows);
  users.sort((a, b) => {
    // 勉強中を先頭に
    if (a.isStudying !== b.isStudying) return a.isStudying ? -1 : 1;
    // 勉強中同士は開始が新しい順
    if (a.studyingSince && b.studyingSince) {
      return b.studyingSince.getTime() - a.studyingSince.getTime();
    }
    // それ以外は username 昇順
    return (a.username ?? "").localeCompare(b.username ?? "");
  });

  return Response.json({ users });
}
