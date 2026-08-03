import { prisma } from "@/lib/prisma";
import { apiError, requireOnboardedUser } from "@/lib/api";
import { sendReportEmail } from "@/lib/resend";

/**
 * POST /api/v1/posts/:id/report — 投稿の報告
 * 指定された投稿の内容と投稿者名、報告者名を管理者にメールで送信する。
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const authed = await requireOnboardedUser(request);
  if (authed instanceof Response) return authed;
  const { user: reporter } = authed;

  const { id } = await ctx.params;

  const post = await prisma.studyPost.findUnique({
    where: { id },
  });

  if (!post) {
    return apiError(404, "POST_NOT_FOUND", "投稿が見つかりません。");
  }

  if (post.userId === reporter.id) {
    return apiError(400, "BAD_REQUEST", "自分の投稿は報告できません。");
  }

  const targetEmail = process.env.REPORT_EMAIL_ADDRESS;
  if (!targetEmail) {
    console.error("REPORT_EMAIL_ADDRESS is not set");
    return apiError(500, "INTERNAL_SERVER_ERROR", "サーバーの設定エラーによりメールが送信できませんでした。");
  }

  const postUser = await prisma.user.findUnique({
    where: { id: post.userId },
    select: { name: true }
  });
  const postUserName = postUser?.name ?? "不明なユーザー";
  const reporterName = reporter.name ?? "不明なユーザー";
  const content = post.comment ?? "(コメントなし)";

  try {
    await sendReportEmail(targetEmail, id, content, postUserName, reporterName);
  } catch (error) {
    console.error("Failed to send report email:", error);
    return apiError(500, "INTERNAL_SERVER_ERROR", "メールの送信に失敗しました。");
  }

  return new Response(null, { status: 200 });
}
