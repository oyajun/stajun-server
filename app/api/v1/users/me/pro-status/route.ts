import { prisma } from "@/lib/prisma";
import {
  apiError,
  isUserPro,
  readJson,
  requireUser,
} from "@/lib/api";

/**
 * POST /api/v1/users/me/pro-status — クライアント側の課金（RevenueCat）状態をサーバーへ同期
 * body: { isPro: boolean, proExpiresAt?: string | null }
 */
export async function POST(request: Request) {
  const authed = await requireUser(request);
  if (authed instanceof Response) return authed;
  const { user } = authed;

  const body = await readJson(request);
  if (body === null || typeof body !== "object") {
    return apiError(400, "INVALID_BODY", "リクエストボディが不正です。");
  }

  const { isPro, proExpiresAt: rawExpiresAt } = body as Record<
    string,
    unknown
  >;

  if (typeof isPro !== "boolean") {
    return apiError(400, "INVALID_IS_PRO", "isPro（boolean）が必要です。");
  }

  let proExpiresAt: Date | null = null;
  if (typeof rawExpiresAt === "string") {
    const d = new Date(rawExpiresAt);
    if (!isNaN(d.getTime())) {
      proExpiresAt = d;
    }
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      isPro,
      proExpiresAt,
    },
    select: {
      id: true,
      isPro: true,
      proExpiresAt: true,
    },
  });

  return Response.json({
    id: updated.id,
    isPro: isUserPro(updated),
    proExpiresAt: updated.proExpiresAt ? updated.proExpiresAt.toISOString() : null,
  });
}

/**
 * GET /api/v1/users/me/pro-status — 現在のPro課金状態を取得
 */
export async function GET(request: Request) {
  const authed = await requireUser(request);
  if (authed instanceof Response) return authed;
  const { user } = authed;

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      isPro: true,
      proExpiresAt: true,
    },
  });

  if (!dbUser) {
    return apiError(404, "USER_NOT_FOUND", "ユーザーが見つかりません。");
  }

  return Response.json({
    id: dbUser.id,
    isPro: isUserPro(dbUser),
    proExpiresAt: dbUser.proExpiresAt ? dbUser.proExpiresAt.toISOString() : null,
  });
}
