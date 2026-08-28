import { getUnreadNotificationCount, requireOnboardedUser } from "@/lib/api";

/**
 * GET /api/v1/notifications/unread-count — 未読通知件数を取得。
 */
export async function GET(request: Request) {
  const authed = await requireOnboardedUser(request);
  if (authed instanceof Response) return authed;

  const unreadCount = await getUnreadNotificationCount(authed.user.id);
  return Response.json({ unreadCount });
}
