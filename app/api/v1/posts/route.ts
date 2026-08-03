import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import {
  apiError,
  isValidComment,
  isValidMinutes,
  parseIntParam,
  readJson,
  requireOnboardedUser,
  resolveOnboardedUserId,
} from "@/lib/api";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const AUTHOR_SELECT = {
  id: true,
  name: true,
  iconEmoji: true,
  iconBackgroundColor: true,
  isAnonymous: true,
} satisfies Prisma.UserSelect;

/**
 * POST /api/v1/posts — 学習時間の投稿を作成。
 * body: { minutes: number, comment?: string }
 */
export async function POST(request: Request) {
  const authed = await requireOnboardedUser(request);
  if (authed instanceof Response) return authed;
  const { user } = authed;

  const body = await readJson(request);
  if (body === null || typeof body !== "object") {
    return apiError(400, "INVALID_BODY", "リクエストボディが不正です。");
  }
  const { minutes, comment: rawComment } = body as Record<string, unknown>;

  if (!isValidMinutes(minutes)) {
    return apiError(
      400,
      "INVALID_MINUTES",
      "minutesは1〜1440の整数にしてください。",
    );
  }

  let comment: string | null = null;
  if (rawComment !== undefined && rawComment !== null) {
    if (!isValidComment(rawComment)) {
      return apiError(
        400,
        "INVALID_COMMENT",
        "commentは500文字以内で、改行等の制御文字は使えません。",
      );
    }
    // 空白のみは未入力扱い（null）にする
    comment = rawComment.trim().length === 0 ? null : rawComment;
  }

  const post = await prisma.studyPost.create({
    data: { userId: user.id, minutes, comment },
    select: { id: true, minutes: true, comment: true, createdAt: true },
  });

  return Response.json(post, { status: 201 });
}

/**
 * GET /api/v1/posts — 投稿一覧。
 * - userId 無し: ホームタイムライン（自分＋フォロー中）
 * - userId 指定（`me`可）: そのユーザー本人の投稿
 * 新しい順（createdAt desc, id desc）。カーソルページング `?cursor=<postId>&limit=`。
 */
export async function GET(request: Request) {
  const authed = await requireOnboardedUser(request);
  if (authed instanceof Response) return authed;
  const { user } = authed;

  const params = new URL(request.url).searchParams;
  const userIdParam = params.get("userId");
  const cursor = params.get("cursor");
  const limit = parseIntParam(params.get("limit"), {
    fallback: DEFAULT_LIMIT,
    min: 1,
    max: MAX_LIMIT,
  });

  let where: Prisma.StudyPostWhereInput;
  if (userIdParam !== null) {
    const targetId = await resolveOnboardedUserId(userIdParam, user.id);
    if (!targetId) {
      return apiError(404, "USER_NOT_FOUND", "ユーザーが見つかりません。");
    }
    where = { userId: targetId };
  } else {
    // ホームタイムライン = 自分 + フォロー中
    const follows = await prisma.follow.findMany({
      where: { followerId: user.id },
      select: { followingId: true },
    });
    const authorIds = [user.id, ...follows.map((f) => f.followingId)];
    where = { userId: { in: authorIds } };
  }

  const posts = await prisma.studyPost.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      userId: true,
      minutes: true,
      comment: true,
      createdAt: true,
    },
  });

  // 投稿者情報を一括解決
  const ids = [...new Set(posts.map((p) => p.userId))];
  const authors = ids.length
    ? await prisma.user.findMany({
        where: { id: { in: ids } },
        select: AUTHOR_SELECT,
      })
    : [];
  const authorById = new Map(authors.map((a) => [a.id, a]));

  const result = posts.map((p) => {
    const a = authorById.get(p.userId);
    return {
      id: p.id,
      userId: p.userId,
      minutes: p.minutes,
      comment: p.comment ?? null,
      createdAt: p.createdAt,
      user: a
        ? {
            id: a.id,
            name: a.name ?? "名無し",
            iconEmoji: a.iconEmoji ?? "👤",
            iconBackgroundColor: a.iconBackgroundColor ?? "#CCCCCC",
            isAnonymous: a.isAnonymous ?? false,
          }
        : null,
    };
  });

  return Response.json({
    posts: result,
    nextCursor: posts.length === limit ? posts[posts.length - 1].id : null,
  });
}
