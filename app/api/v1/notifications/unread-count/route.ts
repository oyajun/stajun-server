import { prisma } from "@/lib/prisma";
import { requireOnboardedUser } from "@/lib/api";

/**
 * GET /api/v1/notifications/unread-count — 未読通知件数を取得。
 */
export async function GET(request: Request) {
  const authed = await requireOnboardedUser(request);
  if (authed instanceof Response) return authed;
  const { user } = authed;

  // ブロック関係にあるユーザーIDを取得して除外
  const blocks = await prisma.block.findMany({
    where: {
      OR: [{ blockerId: user.id }, { blockedId: user.id }],
    },
    select: { blockerId: true, blockedId: true },
  });
  const blockedUserIds = blocks.map((b) =>
    b.blockerId === user.id ? b.blockedId : b.blockerId,
  );

  const unreadCount = await prisma.notification.count({
    where: {
      userId: user.id,
      isRead: false,
      ...(blockedUserIds.length > 0
        ? {
            OR: [
              { actorId: null },
              { actorId: { notIn: blockedUserIds } },
            ],
          }
        : {}),
    },
  });

  return Response.json({ unreadCount });
}
