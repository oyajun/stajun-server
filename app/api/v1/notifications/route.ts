import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import {
  parseIntParam,
  requireOnboardedUser,
} from "@/lib/api";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const ACTOR_SELECT = {
  id: true,
  name: true,
  iconEmoji: true,
  iconBackgroundColor: true,
  isAnonymous: true,
} satisfies Prisma.UserSelect;

/**
 * GET /api/v1/notifications — 通知一覧を取得。
 * クエリパラメータ:
 * - cursor: 通知ID（ページネーション用）
 * - limit: 取得件数（デフォルト20, 最大50）
 */
export async function GET(request: Request) {
  const authed = await requireOnboardedUser(request);
  if (authed instanceof Response) return authed;
  const { user } = authed;

  const params = new URL(request.url).searchParams;
  const cursor = params.get("cursor");
  const limit = parseIntParam(params.get("limit"), {
    fallback: DEFAULT_LIMIT,
    min: 1,
    max: MAX_LIMIT,
  });

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

  const where: Prisma.NotificationWhereInput = {
    userId: user.id,
    ...(blockedUserIds.length > 0
      ? {
          OR: [
            { actorId: null },
            { actorId: { notIn: blockedUserIds } },
          ],
        }
      : {}),
  };

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        type: true,
        actorId: true,
        postId: true,
        extra: true,
        isRead: true,
        createdAt: true,
      },
    }),
    prisma.notification.count({
      where: {
        ...where,
        isRead: false,
      },
    }),
  ]);

  const hasMore = notifications.length > limit;
  const items = hasMore ? notifications.slice(0, limit) : notifications;
  const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

  // アクター情報を一括取得
  const actorIds = [...new Set(items.map((n) => n.actorId).filter((id): id is string => id !== null))];
  const actors = actorIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: ACTOR_SELECT,
      })
    : [];
  const actorMap = new Map(actors.map((a) => [a.id, a]));

  const formattedNotifications = items.map((n) => ({
    id: n.id,
    type: n.type,
    actor: n.actorId ? actorMap.get(n.actorId) ?? null : null,
    postId: n.postId,
    extra: n.extra,
    isRead: n.isRead,
    createdAt: n.createdAt.toISOString(),
  }));

  return Response.json({
    notifications: formattedNotifications,
    unreadCount,
    nextCursor,
  });
}

/**
 * POST /api/v1/notifications/read-all — 全未読通知を一括既読にする。
 */
export async function POST(request: Request) {
  const authed = await requireOnboardedUser(request);
  if (authed instanceof Response) return authed;
  const { user } = authed;

  await prisma.notification.updateMany({
    where: {
      userId: user.id,
      isRead: false,
    },
    data: {
      isRead: true,
    },
  });

  return Response.json({ success: true });
}
