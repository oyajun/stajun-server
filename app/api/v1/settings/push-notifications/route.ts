import { prisma } from "@/lib/prisma";
import { apiError, readJson, requireOnboardedUser } from "@/lib/api";

/**
 * GET /api/v1/settings/push-notifications
 * ログインユーザーのプッシュ通知設定を取得。
 * 未設定時はすべて true のデフォルト値を返す。
 */
export async function GET(request: Request) {
  const authed = await requireOnboardedUser(request);
  if (authed instanceof Response) return authed;
  const { user } = authed;

  const setting = await prisma.pushNotificationSetting.findUnique({
    where: { userId: user.id },
    select: {
      enabled: true,
      follow: true,
      studyStart: true,
    },
  });

  return Response.json({
    enabled: setting?.enabled ?? true,
    follow: setting?.follow ?? true,
    studyStart: setting?.studyStart ?? true,
  });
}

/**
 * PUT /api/v1/settings/push-notifications
 * ログインユーザーのプッシュ通知設定を更新（部分更新対応・upsert）。
 */
export async function PUT(request: Request) {
  const authed = await requireOnboardedUser(request);
  if (authed instanceof Response) return authed;
  const { user } = authed;

  const raw = await readJson(request);
  if (!raw || typeof raw !== "object") {
    return apiError(400, "BAD_REQUEST", "リクエスト形式が不正です。");
  }

  const body = raw as Record<string, unknown>;

  if (body.enabled !== undefined && typeof body.enabled !== "boolean") {
    return apiError(400, "BAD_REQUEST", "enabled は真偽値である必要があります。");
  }
  if (body.follow !== undefined && typeof body.follow !== "boolean") {
    return apiError(400, "BAD_REQUEST", "follow は真偽値である必要があります。");
  }
  if (body.studyStart !== undefined && typeof body.studyStart !== "boolean") {
    return apiError(400, "BAD_REQUEST", "studyStart は真偽値である必要があります。");
  }

  const current = await prisma.pushNotificationSetting.findUnique({
    where: { userId: user.id },
  });

  const enabled =
    typeof body.enabled === "boolean" ? body.enabled : (current?.enabled ?? true);
  const follow =
    typeof body.follow === "boolean" ? body.follow : (current?.follow ?? true);
  const studyStart =
    typeof body.studyStart === "boolean"
      ? body.studyStart
      : (current?.studyStart ?? true);

  const updated = await prisma.pushNotificationSetting.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      enabled,
      follow,
      studyStart,
    },
    update: {
      enabled,
      follow,
      studyStart,
    },
    select: {
      enabled: true,
      follow: true,
      studyStart: true,
    },
  });

  return Response.json(updated);
}
