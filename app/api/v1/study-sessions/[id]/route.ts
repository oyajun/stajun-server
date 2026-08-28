import {
  apiError,
  getStudySessionStatus,
  requireOnboardedUser,
  resolveOnboardedUserId,
} from "@/lib/api";

/**
 * GET /api/v1/study-sessions/:id — :id の現在の学習状態取得。
 * `:id` は `me` 可（自分の状態）。存在しない/未オンボーディングは404。
 */
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/v1/study-sessions/[id]">,
) {
  const authed = await requireOnboardedUser(request);
  if (authed instanceof Response) return authed;
  const { user } = authed;

  const { id } = await ctx.params;
  const targetId = await resolveOnboardedUserId(id, user.id);
  if (!targetId) {
    return apiError(404, "USER_NOT_FOUND", "ユーザーが見つかりません。");
  }

  const status = await getStudySessionStatus(targetId);
  return Response.json(status);
}
