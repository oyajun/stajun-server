import { prisma } from "@/lib/prisma";
import { apiError, requireOnboardedUser } from "@/lib/api";

/**
 * DELETE /api/v1/posts/:id — 投稿削除（本人のみ）。`:id` は投稿ID。
 * 他人の投稿は403、存在しない投稿は404。
 */
export async function DELETE(
  request: Request,
  ctx: RouteContext<"/api/v1/posts/[id]">,
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
