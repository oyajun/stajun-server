import {
  apiError,
  getFollowingUsersWithPresence,
  requireOnboardedUser,
  resolveOnboardedUserId,
} from "@/lib/api";

/**
 * GET /api/v1/following/:id — :id がフォロー中のユーザー一覧。
 * 各ユーザーに勉強中フラグ（isStudying/studyingSince）を付け、
 * 勉強中を先頭（開始が新しい順）、非勉強中は lastActiveAt が最近順（nullは最後）にソートして返す。
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

  const users = await getFollowingUsersWithPresence(user.id, targetId);
  return Response.json({ users });
}
