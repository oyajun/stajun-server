import { setDeviceTokenForSession } from "@/lib/apns";
import { apiError, readJson, requireOnboardedUser } from "@/lib/api";

/**
 * POST /api/v1/apns-token — APNs デバイストークンを登録・上書きする。
 *
 * リクエストボディ: { token: string }
 * - sessionId と userId をID（キー）として、該当セッションの token を最新値で上書き
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

  await setDeviceTokenForSession(user.id, session.id, token);

  return Response.json({});
}
