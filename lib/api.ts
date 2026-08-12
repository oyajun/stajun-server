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
 * 認証必須 かつ オンボーディング完了（name が設定済み）必須。
 * 未認証は401、オンボーディング未完了（name IS NULL）は403を返す。
 * POST /api/v1/users/me 以外の /api/v1/* で使う。
 */
export async function requireOnboardedUser(
  request: Request,
): Promise<{ user: SessionUser } | Response> {
  return requireUser(request);
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

// --- タイムゾーン・日付境界 ---

/**
 * クライアントから受け取るUTCオフセット（分）の許容範囲。
 * 実在するタイムゾーンは UTC-12:00 〜 UTC+14:00 に収まる。
 */
const TZ_OFFSET_MIN_MINUTES = -12 * 60;
const TZ_OFFSET_MAX_MINUTES = 14 * 60;
const TZ_OFFSET_RE = /^([+-])(\d{2}):?(\d{2})$/;
const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** ローカル日付（年・月1〜12・日）。UTCではなくクライアントのタイムゾーン上の日付。 */
export type LocalDate = { year: number; month: number; day: number };

/**
 * `+09:00` 形式のUTCオフセットを分に変換する（日本なら `+09:00` → 540）。不正なら null。
 * `+0900` / `Z` も受け付ける。またクエリ文字列で `+` が `%2B` にエンコードされず
 * 空白としてデコードされた場合（`" 09:00"`）も救済する。
 */
export function parseTzOffset(raw: string | null): number | null {
  if (raw === null) return null;
  const normalized = raw.startsWith(" ") ? `+${raw.slice(1)}` : raw;
  if (normalized === "Z" || normalized === "z") return 0;

  const m = TZ_OFFSET_RE.exec(normalized);
  if (!m) return null;
  const [, sign, hh, mm] = m;
  const hours = Number(hh);
  const minutes = Number(mm);
  if (minutes > 59) return null;

  const offset = (sign === "-" ? -1 : 1) * (hours * 60 + minutes);
  if (offset < TZ_OFFSET_MIN_MINUTES || offset > TZ_OFFSET_MAX_MINUTES) {
    return null;
  }
  return offset;
}

/** `YYYY-MM-DD` をローカル日付としてパースする。実在しない日付（2月30日等）は null。 */
export function parseLocalDate(raw: string | null): LocalDate | null {
  if (raw === null) return null;
  const m = YMD_RE.exec(raw);
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = { year: Number(y), month: Number(mo), day: Number(d) };
  // Date.UTC は 2026-02-30 のような値を繰り上げてしまうため、往復させて検証する
  const roundTrip = new Date(Date.UTC(date.year, date.month - 1, date.day));
  if (
    roundTrip.getUTCFullYear() !== date.year ||
    roundTrip.getUTCMonth() + 1 !== date.month ||
    roundTrip.getUTCDate() !== date.day
  ) {
    return null;
  }
  return date;
}

/** ローカル日付を `YYYY-MM-DD` に整形する。 */
export function formatLocalDate({ year, month, day }: LocalDate): string {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/**
 * ローカル日付の 0:00 に対応するUTC時刻を返す（日付の区切り）。
 * `dayOffset` を渡すとその日数だけ後ろにずらす（翌日境界 = 排他的な上限に使う）。
 */
export function localDayStartUtc(
  { year, month, day }: LocalDate,
  tzOffsetMinutes: number,
  dayOffset = 0,
): Date {
  const utcMidnight = Date.UTC(year, month - 1, day + dayOffset);
  return new Date(utcMidnight - tzOffsetMinutes * 60_000);
}

// --- 統計のバケット単位 ---

/** 統計グラフの集計単位。 */
export type StatsUnit = "day" | "week" | "month" | "year";

const STATS_UNITS: readonly string[] = ["day", "week", "month", "year"];

export function isStatsUnit(v: string | null): v is StatsUnit {
  return v !== null && STATS_UNITS.includes(v);
}

/** 年月日を実在する日付に正規化する（`2026-01-32` → `2026-02-01`）。 */
function normalizeLocalDate(
  year: number,
  month: number,
  day: number,
): LocalDate {
  const d = new Date(Date.UTC(year, month - 1, day));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

/**
 * その日付が属するバケットの開始日を返す。
 * 週は **月曜始まり**（ISO 8601）。
 */
export function startOfBucket(date: LocalDate, unit: StatsUnit): LocalDate {
  switch (unit) {
    case "day":
      return date;
    case "week": {
      // getUTCDay() は 0=日曜。月曜を0にして、その分だけ戻す
      const dow = new Date(
        Date.UTC(date.year, date.month - 1, date.day),
      ).getUTCDay();
      return normalizeLocalDate(date.year, date.month, date.day - ((dow + 6) % 7));
    }
    case "month":
      return { year: date.year, month: date.month, day: 1 };
    case "year":
      return { year: date.year, month: 1, day: 1 };
  }
}

/** バケット単位で n 個ぶん進めた日付を返す（負数で戻る）。 */
export function addBuckets(
  date: LocalDate,
  unit: StatsUnit,
  n: number,
): LocalDate {
  switch (unit) {
    case "day":
      return normalizeLocalDate(date.year, date.month, date.day + n);
    case "week":
      return normalizeLocalDate(date.year, date.month, date.day + n * 7);
    case "month":
      return normalizeLocalDate(date.year, date.month + n, date.day);
    case "year":
      return normalizeLocalDate(date.year + n, date.month, date.day);
  }
}

/** ローカル日付の大小比較（a < b で負、a === b で0）。 */
export function compareLocalDate(a: LocalDate, b: LocalDate): number {
  return (
    Date.UTC(a.year, a.month - 1, a.day) - Date.UTC(b.year, b.month - 1, b.day)
  );
}

/** UTC時刻を、指定オフセットのタイムゾーンから見たローカル日付に変換する。 */
export function toLocalDate(date: Date, tzOffsetMinutes: number): LocalDate {
  const shifted = new Date(date.getTime() + tzOffsetMinutes * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
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

// name は表示名。ユーザー指定はidで行うため文字種は限定せず、
// 日本語など非英語もOK。空文字・空白のみ・制御文字・長すぎるものだけ弾く。
export function isValidName(v: unknown): v is string {
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

// コメント: 任意。制御文字（改行等）不可・最大50文字。
export const COMMENT_MAX = 50;
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
 * `"me"` は自分。存在しない/未オンボーディング（name IS NULL）は null。
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
    select: { id: true, name: true },
  });
  if (!target || !target.name) return null;
  return target.id;
}

export type UserRow = {
  id: string;
  name: string | null;
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
      name: r.name || "名無し",
      iconEmoji: r.iconEmoji || "👤",
      iconBackgroundColor: r.iconBackgroundColor || "#CCCCCC",
      isFollowing: followingSet.has(r.id),
      isStudying: since !== null,
      studyingSince: since,
    };
  });
}
