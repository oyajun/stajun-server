import { setDeviceTokenForSession } from "@/lib/apns";
import {
  getBlockedUserIds,
  getFollowingUsersWithPresence,
  getStudySessionStatus,
  getUnreadNotificationCount,
  requireOnboardedUser,
} from "@/lib/api";

/**
 * GET /api/v1/polling — 定期ポーリング統合エンドポイント。
 *
 * クライアントの定期通信を集約し、通信回数と負荷を削減する：
 * 1. 未読通知件数 (unreadCount / unreadNotificationCount)
 * 2. フォロー中ユーザーの勉強中プレゼンス一覧 (users)
 * 3. 自身の現在の学習状態 (studySession)
 *
 * 【後方互換性】
 * - 従来のパラメータなし GET リクエストは完全にそのまま動作（トークンなしでもスルー）。
 * - クエリに ?apnsToken=... が付与されている場合は、sessionId と userId をキーにしてトークンを上書き。
 */
export async function GET(request: Request) {
  const authed = await requireOnboardedUser(request);
  if (authed instanceof Response) return authed;
  const { user, session } = authed;

  // オプショナル: クエリに apnsToken があればデバイストークンを上書き（なければスルー）
  const url = new URL(request.url);
  const apnsToken = url.searchParams.get("apnsToken")?.trim();
  if (apnsToken && session?.id) {
    await setDeviceTokenForSession(user.id, session.id, apnsToken);
  }

  // ブロック関係にあるユーザーIDを取得し、通知とフォローの除外で共通利用
  const blockedUserIds = await getBlockedUserIds(user.id);

  // 1. 未読通知件数
  // 2. フォロー中ユーザー一覧（勉強中プレゼンス付与・ソート済み）
  // 3. 自身の勉強中セッション状態
  // を並列に取得
  const [unreadCount, users, studySession] = await Promise.all([
    getUnreadNotificationCount(user.id, blockedUserIds),
    getFollowingUsersWithPresence(user.id, user.id, blockedUserIds),
    getStudySessionStatus(user.id),
  ]);

  return Response.json({
    unreadCount,
    unreadNotificationCount: unreadCount,
    users,
    studySession,
  });
}
