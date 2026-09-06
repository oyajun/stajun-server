import { prisma } from "@/lib/prisma";
import {
  apiError,
  isValidActivity,
  readJson,
  requireOnboardedUser,
  studyingSinceThreshold,
} from "@/lib/api";

/**
 * PUT /api/v1/study-sessions/activity — 勉強中アクティビティの更新
 * リクエストボディ: { activity: string | null }
 * 空文字または null の場合は未設定（null）にクリアする。
 */
export async function PUT(request: Request) {
  const authed = await requireOnboardedUser(request);
  if (authed instanceof Response) return authed;
  const { user } = authed;

  const body = await readJson(request);
  if (!body || typeof body !== "object") {
    return apiError(400, "BAD_REQUEST", "無効なリクエストボディです。");
  }

  const rawActivity = (body as { activity?: unknown }).activity;
  let activity: string | null = null;
  if (typeof rawActivity === "string") {
    const trimmed = rawActivity.trim();
    if (trimmed.length > 0) {
      if (!isValidActivity(trimmed)) {
        return apiError(
          400,
          "INVALID_ACTIVITY",
          "アクティビティは制御文字なし・最大50文字以内で指定してください。",
        );
      }
      activity = trimmed;
    }
  } else if (rawActivity !== null && rawActivity !== undefined) {
    return apiError(400, "BAD_REQUEST", "activityは文字列またはnullで指定してください。");
  }

  const now = new Date();
  const session = await prisma.studySession.findUnique({
    where: { userId: user.id },
  });

  if (!session || session.startedAt <= studyingSinceThreshold(now)) {
    return apiError(404, "SESSION_NOT_FOUND", "アクティブな勉強セッションがありません。");
  }

  const updated = await prisma.studySession.update({
    where: { userId: user.id },
    data: { activity },
    select: {
      startedAt: true,
      isPaused: true,
      accumulatedSeconds: true,
      activity: true,
    },
  });

  return Response.json(updated);
}
