import { auth } from "@/lib/auth";

type Session = Awaited<ReturnType<typeof auth.api.getSession>>;
export type SessionUser = NonNullable<Session>["user"];

/** 統一エラーレスポンス（body: { error: { code, message } }） */
export function apiError(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}

/**
 * 認証必須。bearerトークン（Authorization: Bearer <token>）からセッションを解決する。
 * 未認証なら401 Response、認証済みなら { user } を返す。
 */
export async function requireUser(
  request: Request,
): Promise<{ user: SessionUser } | Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return apiError(401, "UNAUTHORIZED", "認証が必要です。");
  }
  return { user: session.user };
}

/**
 * 認証必須 かつ オンボーディング完了（username が設定済み）必須。
 * 未認証は401、オンボーディング未完了（username IS NULL）は403を返す。
 * POST /api/v1/users/me 以外の /api/v1/* で使う。
 */
export async function requireOnboardedUser(
  request: Request,
): Promise<{ user: SessionUser } | Response> {
  const result = await requireUser(request);
  if (result instanceof Response) return result;
  if (!result.user.username) {
    return apiError(
      403,
      "ONBOARDING_REQUIRED",
      "先にプロフィール登録（POST /api/v1/users/me）が必要です。",
    );
  }
  return result;
}

/** リクエストボディを JSON として読む。不正なら null。 */
export async function readJson(request: Request): Promise<unknown | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

// --- バリデーション ---

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
// 制御文字（改行・タブ等 U+0000–U+001F, U+007F）を弾くための判定
const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F]/;

// username は表示名。ユーザー指定はidで行うため文字種は限定せず、
// 日本語など非英語もOK。空文字・空白のみ・制御文字・長すぎるものだけ弾く。
export function isValidUsername(v: unknown): v is string {
  if (typeof v !== "string") return false;
  if (v.trim().length === 0) return false;
  if (CONTROL_CHARS_RE.test(v)) return false;
  return [...v].length <= 30;
}

export function isValidIconBackgroundColor(v: unknown): v is string {
  return typeof v === "string" && HEX_COLOR_RE.test(v);
}

export function isValidIconEmoji(v: unknown): v is string {
  // 絵文字1つを想定。厳密な絵文字判定はせず、非空かつ短い文字列に限定する
  if (typeof v !== "string") return false;
  const len = [...v].length;
  return len >= 1 && len <= 8;
}
