import { prisma } from "@/lib/prisma";
import { apiError, readJson } from "@/lib/api";

interface RevenueCatEvent {
  type: string;
  app_user_id: string;
  entitlement_id?: string | null;
  entitlement_ids?: string[] | null;
  expiration_at_ms?: number | null;
  purchased_at_ms?: number | null;
  product_id?: string | null;
  period_type?: string | null;
}

interface RevenueCatWebhookBody {
  api_version?: string;
  event?: RevenueCatEvent;
}

/**
 * POST /api/v1/webhooks/revenuecat
 * RevenueCat からのイベント通知を受信し、ユーザーの Pro 状態を自動更新
 */
export async function POST(request: Request) {
  // Webhook 認証ヘッダーの検証（環境変数が設定されている場合）
  const expectedAuth = process.env.REVENUECAT_WEBHOOK_AUTH_HEADER;
  if (expectedAuth) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== expectedAuth && authHeader !== `Bearer ${expectedAuth}`) {
      return apiError(401, "UNAUTHORIZED", "Webhook 認証に失敗しました。");
    }
  }

  const body = (await readJson(request)) as RevenueCatWebhookBody | null;
  if (!body || !body.event) {
    return apiError(400, "INVALID_BODY", "無効な Webhook ペイロードです。");
  }

  const { event } = body;
  const userId = event.app_user_id;

  if (!userId) {
    return Response.json({ received: true, ignored: "no_app_user_id" });
  }

  // ユーザーが存在するか確認
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  if (!user) {
    // ユーザーが存在しない（匿名ユーザーや別IDの場合）
    return Response.json({ received: true, ignored: "user_not_found" });
  }

  const eventType = event.type;
  const expirationMs = event.expiration_at_ms;
  const proExpiresAt = expirationMs ? new Date(expirationMs) : null;

  switch (eventType) {
    case "INITIAL_PURCHASE":
    case "RENEWAL":
    case "UNCANCELLATION":
    case "PRODUCT_CHANGE":
    case "NON_RENEWING_PURCHASE": {
      await prisma.user.update({
        where: { id: userId },
        data: {
          isPro: true,
          proExpiresAt,
        },
      });
      break;
    }

    case "CANCELLATION": {
      // 解約されても、expiration_at_ms までは有効
      const isStillValid = proExpiresAt ? proExpiresAt > new Date() : false;
      await prisma.user.update({
        where: { id: userId },
        data: {
          isPro: isStillValid,
          proExpiresAt,
        },
      });
      break;
    }

    case "EXPIRATION": {
      // 有効期限切れ
      await prisma.user.update({
        where: { id: userId },
        data: {
          isPro: false,
          proExpiresAt: proExpiresAt ?? new Date(),
        },
      });
      break;
    }

    default:
      // その他のイベント（TEST, BILLING_ISSUE 等）
      break;
  }

  return Response.json({ received: true, eventType, userId });
}
