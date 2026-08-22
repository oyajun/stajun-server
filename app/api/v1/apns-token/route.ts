import { prisma } from "@/lib/prisma";
import { apiError, readJson, requireOnboardedUser } from "@/lib/api";

/**
 * POST /api/v1/apns-token — APNs デバイストークンを登録する。
 *
 * リクエストボディ: { token: string }
 * - 同一トークンは upsert（重複なし）
 * - 成功時: 200 {}
 */
export async function POST(request: Request) {
  const authed = await requireOnboardedUser(request);
  if (authed instanceof Response) return authed;
  const { user, session } = authed;

  const body = await readJson(request);
  if (!body || typeof body !== "object") {
    return apiError(400, "INVALID_BODY", "リクエストボディが不正です。");
  }
  const { token } = body as Record<string, unknown>;
  if (typeof token !== "string" || token.trim().length === 0) {
    return apiError(400, "INVALID_TOKEN", "token が不正です。");
  }

  // token は UNIQUE 制約あり。同じトークンが別ユーザーから来た場合も含め、
  // userId / sessionId を最新のもので上書きする（端末の再ログイン対応）。
  // sessionId に Cascade が設定されているため、ログアウト（Session 削除）時に自動でトークンも削除される。
  await prisma.deviceToken.upsert({
    where: { token },
    create: { userId: user.id, sessionId: session?.id, token },
    update: { userId: user.id, sessionId: session?.id },
  });

  return Response.json({});
}
