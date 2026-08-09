import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  apiError,
  isValidIconBackgroundColor,
  isValidIconEmoji,
  isValidName,
  readJson,
  requireOnboardedUser,
  requireUser,
} from "@/lib/api";
import { isAPIError } from "better-auth/api";


/** GET /api/v1/users/me — 自分のプロフィール取得 */
export async function GET(request: Request) {
  const authed = await requireOnboardedUser(request);
  if (authed instanceof Response) return authed;
  const { user } = authed;

  return Response.json({
    id: user.id,
    name: user.name || "名無し",
    iconEmoji: user.iconEmoji || "👤",
    iconBackgroundColor: user.iconBackgroundColor || "#CCCCCC",
    isAnonymous: user.isAnonymous ?? false,
    email: user.isAnonymous ? null : (user.email ?? null),
  });
}

/** PATCH /api/v1/users/me — プロフィール登録・更新（部分更新） */
export async function PATCH(request: Request) {
  const authed = await requireUser(request);
  if (authed instanceof Response) return authed;
  const { user } = authed;

  const body = await readJson(request);
  if (body === null || typeof body !== "object") {
    return apiError(400, "INVALID_BODY", "リクエストボディが不正です。");
  }
  const { name, iconEmoji, iconBackgroundColor } = body as Record<
    string,
    unknown
  >;

  const data: {
    name?: string;
    iconEmoji?: string;
    iconBackgroundColor?: string;
  } = {};

  if (name !== undefined) {
    if (!isValidName(name)) {
      return apiError(
        400,
        "INVALID_NAME",
        "nameは1〜30文字で、空白のみ・改行等の制御文字は使えません。",
      );
    }
    data.name = name;
  }
  if (iconEmoji !== undefined) {
    if (!isValidIconEmoji(iconEmoji)) {
      return apiError(400, "INVALID_ICON_EMOJI", "iconEmojiが不正です。");
    }
    data.iconEmoji = iconEmoji;
  }
  if (iconBackgroundColor !== undefined) {
    if (!isValidIconBackgroundColor(iconBackgroundColor)) {
      return apiError(
        400,
        "INVALID_ICON_BACKGROUND_COLOR",
        "iconBackgroundColorは#RRGGBB形式にしてください。",
      );
    }
    data.iconBackgroundColor = iconBackgroundColor;
  }

  if (Object.keys(data).length === 0) {
    return apiError(400, "NO_FIELDS", "更新対象のフィールドがありません。");
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data,
    select: {
      id: true,
      name: true,
      iconEmoji: true,
      iconBackgroundColor: true,
    },
  });

  return Response.json(updated);
}

/**
 * DELETE /api/v1/users/me — アカウント削除
 * better-auth の deleteUser を使う。フレッシュなセッションが必要。
 * 非フレッシュ（freshAgeより古い）の場合は403を返し、クライアントはOTP再認証へ。
 */
export async function DELETE(request: Request) {
  // アカウント削除は認証のみ必須（オンボーディング未完了でも実行可能にする）
  const authed = await requireUser(request);
  if (authed instanceof Response) return authed;

  try {
    await auth.api.deleteUser({
      headers: request.headers,
      body: {},
    });
  } catch (e) {
    if (isAPIError(e)) {
      // 非フレッシュセッション時は SESSION_EXPIRED（400）が投げられる → 403に変換
      if (e.body?.code === "SESSION_EXPIRED") {
        return apiError(
          403,
          "SESSION_NOT_FRESH",
          "セッションが古いため削除できません。再認証してからやり直してください。",
        );
      }
      return apiError(
        e.statusCode ?? 400,
        e.body?.code ?? "DELETE_FAILED",
        e.body?.message ?? "アカウント削除に失敗しました。",
      );
    }
    throw e;
  }

  return new Response(null, { status: 204 });
}
