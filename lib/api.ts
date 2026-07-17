import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Session = Awaited<ReturnType<typeof auth.api.getSession>>;
export type SessionUser = NonNullable<Session>["user"];

/** 統一エラーレスポンス（body: { error: { code, message } }） */
export function apiError(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}

/** 勉強中とみなす最大経過時間。これを超えた StudySession は勉強中扱いしない。 */
export const STUDYING_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * 「勉強中」判定に使う startedAt の下限を返す（これより新しければ勉強中）。
 * 端末クラッシュ等で残った古い行を表示上握りつぶすためのしきい値。
 */
export function studyingSinceThreshold(now: Date = new Date()) {
  return new Date(now.getTime() - STUDYING_MAX_AGE_MS);
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

/** クエリ整数を安全にパースしてクランプする。未指定/不正は fallback。 */
export function parseIntParam(
  raw: string | null,
  { fallback, min, max }: { fallback: number; min: number; max: number },
): number {
  if (raw === null) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
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

// 勉強時間（分）: 整数 1〜1440（=24時間）
export const MINUTES_MIN = 1;
export const MINUTES_MAX = 1440;
export function isValidMinutes(v: unknown): v is number {
  return (
    typeof v === "number" &&
    Number.isInteger(v) &&
    v >= MINUTES_MIN &&
    v <= MINUTES_MAX
  );
}

// コメント: 任意。制御文字（改行等）不可・最大500文字。
export const COMMENT_MAX = 500;
export function isValidComment(v: unknown): v is string {
  if (typeof v !== "string") return false;
  if (CONTROL_CHARS_RE.test(v)) return false;
  return [...v].length <= COMMENT_MAX;
}

// --- ユーザーid解決・要約 ---

/** パスの :id を解決する。`"me"` は自分自身の id に読み替える。 */
export function resolveUserIdParam(idParam: string, selfId: string): string {
  return idParam === "me" ? selfId : idParam;
}

/**
 * :id を解決し、公開対象（オンボーディング完了）のユーザーidを返す。
 * `"me"` は自分。存在しない/未オンボーディング（username IS NULL）は null。
 */
export async function resolveOnboardedUserId(
  idParam: string,
  selfId: string,
): Promise<string | null> {
  const id = resolveUserIdParam(idParam, selfId);
  // 自分は requireOnboardedUser 通過済みなので追加クエリ不要
  if (id === selfId) return id;
  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true },
  });
  if (!target || !target.username) return null;
  return target.id;
}

export type UserRow = {
  id: string;
  username: string | null;
  iconEmoji: string | null;
  iconBackgroundColor: string | null;
};

/**
 * ユーザー行に、閲覧者から見たフォロー状態と現在の学習状態を付与する。
 * 入力の並び順を保持する（呼び出し側で必要ならさらにソートする）。
 */
export async function annotateUsers(viewerId: string, rows: UserRow[]) {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [follows, activeSessions] = await Promise.all([
    prisma.follow.findMany({
      where: { followerId: viewerId, followingId: { in: ids } },
      select: { followingId: true },
    }),
    prisma.studySession.findMany({
      where: { userId: { in: ids }, startedAt: { gt: studyingSinceThreshold() } },
      select: { userId: true, startedAt: true },
    }),
  ]);
  const followingSet = new Set(follows.map((f) => f.followingId));
  // StudySession は1ユーザー1行なので userId で一意にマップできる。
  const studyingSince = new Map(
    activeSessions.map((s) => [s.userId, s.startedAt]),
  );
  return rows.map((r) => {
    const since = studyingSince.get(r.id) ?? null;
    return {
      id: r.id,
      username: r.username,
      iconEmoji: r.iconEmoji ?? null,
      iconBackgroundColor: r.iconBackgroundColor ?? null,
      isFollowing: followingSet.has(r.id),
      isStudying: since !== null,
      studyingSince: since,
    };
  });
}
