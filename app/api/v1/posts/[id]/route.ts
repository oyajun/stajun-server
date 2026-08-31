import { prisma } from "@/lib/prisma";
import {
  apiError,
  isValidComment,
  isValidMinutes,
  readJson,
  requireOnboardedUser,
} from "@/lib/api";

/**
 * PATCH /api/v1/posts/:id — 投稿編集（本人のみ）。
 * body: { minutes?: number, comment?: string }
 */
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const authed = await requireOnboardedUser(request);
  if (authed instanceof Response) return authed;
  const { user } = authed;

  const { id } = await ctx.params;

  const post = await prisma.studyPost.findUnique({
    where: { id },
    select: { id: true, userId: true },
  });
  if (!post) {
    return apiError(404, "POST_NOT_FOUND", "投稿が見つかりません。");
  }
  if (post.userId !== user.id) {
    return apiError(403, "FORBIDDEN", "自分の投稿のみ編集できます。");
  }

  const body = await readJson(request);
  if (body === null || typeof body !== "object") {
    return apiError(400, "INVALID_BODY", "リクエストボディが不正です。");
  }
  const { minutes, comment: rawComment } = body as Record<string, unknown>;

  const data: { minutes?: number; comment?: string | null } = {};

  if (minutes !== undefined) {
    if (!isValidMinutes(minutes)) {
      return apiError(
        400,
        "INVALID_MINUTES",
        "minutesは1〜1440の整数にしてください。",
      );
    }
    data.minutes = minutes;
  }

  if (rawComment !== undefined) {
    if (rawComment !== null) {
      if (!isValidComment(rawComment)) {
        return apiError(
          400,
          "INVALID_COMMENT",
          "commentは50文字以内で、改行等の制御文字は使えません。",
        );
      }
      data.comment = rawComment.trim().length === 0 ? null : rawComment;
    } else {
      data.comment = null;
    }
  }

  if (Object.keys(data).length === 0) {
    return apiError(400, "NO_UPDATES", "更新する項目がありません。");
  }

  const updated = await prisma.studyPost.update({
    where: { id },
    data,
    select: { id: true, minutes: true, comment: true, createdAt: true },
  });

  return Response.json(updated);
}

/**
 * DELETE /api/v1/posts/:id — 投稿削除（本人のみ）。`:id` は投稿ID。
 * 他人の投稿は403、存在しない投稿は404。
 */
export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const authed = await requireOnboardedUser(request);
  if (authed instanceof Response) return authed;
  const { user } = authed;

  const { id } = await ctx.params;

  const post = await prisma.studyPost.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!post) {
    return apiError(404, "POST_NOT_FOUND", "投稿が見つかりません。");
  }
  if (post.userId !== user.id) {
    return apiError(403, "FORBIDDEN", "自分の投稿のみ削除できます。");
  }

  await prisma.studyPost.delete({ where: { id } });

  return new Response(null, { status: 204 });
}
