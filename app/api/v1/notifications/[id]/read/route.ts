import { prisma } from "@/lib/prisma";
import { apiError, requireOnboardedUser } from "@/lib/api";

/**
 * PATCH /api/v1/notifications/:id/read — 特定の通知を既読にする。
 */
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const authed = await requireOnboardedUser(request);
  if (authed instanceof Response) return authed;
  const { user } = authed;

  const { id } = await ctx.params;

  const notification = await prisma.notification.findUnique({
    where: { id },
  });

  if (!notification || notification.userId !== user.id) {
    return apiError(404, "NOT_FOUND", "通知が見つかりません。");
  }

  const updated = await prisma.notification.update({
    where: { id },
    data: { isRead: true },
    select: { id: true, isRead: true },
  });

  return Response.json(updated);
}
