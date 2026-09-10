import { createSign } from "crypto";
import { connect } from "http2";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// 設定
// ---------------------------------------------------------------------------

function normalizePrivateKey(raw: string): string {
  let key = raw.trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }
  key = key.replace(/\\n/g, "\n");
  const cleaned = key
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const wrapped = cleaned.match(/.{1,64}/g)?.join("\n") ?? cleaned;
  return `-----BEGIN PRIVATE KEY-----\n${wrapped}\n-----END PRIVATE KEY-----`;
}

const APNS_KEY_ID = process.env.APNS_KEY_ID ?? "";
const APNS_TEAM_ID = process.env.APNS_TEAM_ID ?? "";
const APNS_BUNDLE_ID = process.env.APNS_BUNDLE_ID ?? "";
const APNS_PRIVATE_KEY = normalizePrivateKey(process.env.APNS_PRIVATE_KEY ?? "");
const IS_PRODUCTION = process.env.APNS_PRODUCTION === "true";

const PRIMARY_APNS_HOST = IS_PRODUCTION
  ? "api.push.apple.com"
  : "api.sandbox.push.apple.com";
const FALLBACK_APNS_HOST = IS_PRODUCTION
  ? "api.sandbox.push.apple.com"
  : "api.push.apple.com";

/** JWT の有効期間（APNs は 60 分以内のものしか受け付けない） */
const JWT_TTL_MS = 50 * 60 * 1000; // 50 分

// ---------------------------------------------------------------------------
// JWT
// ---------------------------------------------------------------------------

let cachedJwt: { token: string; generatedAt: number } | null = null;

/** APNs 用 JWT を生成（50 分キャッシュ）。ES256 + .p8 秘密鍵。 */
function getJwt(): string {
  const now = Date.now();
  if (cachedJwt && now - cachedJwt.generatedAt < JWT_TTL_MS) {
    return cachedJwt.token;
  }

  const iat = Math.floor(now / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: "ES256", kid: APNS_KEY_ID }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ iss: APNS_TEAM_ID, iat }),
  ).toString("base64url");

  const sign = createSign("SHA256");
  sign.update(`${header}.${payload}`);
  const signature = sign.sign(APNS_PRIVATE_KEY, "base64url");

  const token = `${header}.${payload}.${signature}`;
  cachedJwt = { token, generatedAt: now };
  return token;
}

// ---------------------------------------------------------------------------
// 通知ペイロード型
// ---------------------------------------------------------------------------

interface ApnsPayload {
  aps: {
    alert: {
      /** 通知タイトル（太字表示） */
      title?: string;
      /** デバイス言語に合わせて自動ローカライズされる本文キー（Localizable.xcstrings で定義） */
      "loc-key": string;
      /** ローカライズキーに埋め込む引数 */
      "loc-args": string[];
    };
    sound: string;
  };
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// 単一デバイスへの送信
// ---------------------------------------------------------------------------

type SendResult =
  | { ok: true }
  | { ok: false; reason: "invalid_token" | "other"; error?: string };

const APNS_TIMEOUT_MS = 5000;

async function sendPushNotificationToHost(
  host: string,
  deviceToken: string,
  payload: ApnsPayload,
  jwt: string,
): Promise<SendResult> {
  return new Promise((resolve) => {
    let resolved = false;
    const safeResolve = (res: SendResult) => {
      if (resolved) return;
      resolved = true;
      if (timeoutTimer) clearTimeout(timeoutTimer);
      try {
        client.destroy();
      } catch {
        // ignore
      }
      resolve(res);
    };

    const client = connect(`https://${host}`);

    const timeoutTimer = setTimeout(() => {
      safeResolve({ ok: false, reason: "other", error: "APNs connection timeout" });
    }, APNS_TIMEOUT_MS);

    client.on("error", (err) => {
      safeResolve({ ok: false, reason: "other", error: String(err) });
    });

    const body = JSON.stringify(payload);
    let req: ReturnType<typeof client.request>;
    try {
      req = client.request({
        ":method": "POST",
        ":path": `/3/device/${deviceToken}`,
        ":scheme": "https",
        ":authority": host,
        authorization: `bearer ${jwt}`,
        "apns-topic": APNS_BUNDLE_ID,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
      });
    } catch (err) {
      safeResolve({ ok: false, reason: "other", error: String(err) });
      return;
    }

    req.on("error", (err) => {
      safeResolve({ ok: false, reason: "other", error: String(err) });
    });

    req.write(body);
    req.end();

    let statusCode = 0;
    req.on("response", (headers) => {
      statusCode = Number(headers[":status"]);
    });

    let responseBody = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => {
      responseBody += chunk;
    });

    req.on("end", () => {
      if (statusCode === 200) {
        safeResolve({ ok: true });
      } else {
        let reason = "";
        try {
          const parsed = JSON.parse(responseBody) as { reason?: string };
          reason = parsed.reason ?? "";
        } catch {
          reason = responseBody;
        }
        const isInvalidToken =
          reason === "BadDeviceToken" ||
          reason === "Unregistered" ||
          reason === "BadEnvironmentKeyInToken" ||
          reason === "DeviceTokenNotForTopic" ||
          reason === "TopicDisallowed";
        safeResolve({
          ok: false,
          reason: isInvalidToken ? "invalid_token" : "other",
          error: reason,
        });
      }
    });
  });
}

/**
 * 指定トークンに APNs プッシュ通知を送る。
 * メインの環境（本番/Sandbox）で環境不一致（invalid_token）と疑われる場合のみ、フォールバック環境でも試行する。
 * 両方の環境で invalid_token と判定された場合のみ invalid_token として返す（一時エラーでの誤削除防止）。
 */
async function sendPushNotification(
  deviceToken: string,
  payload: ApnsPayload,
): Promise<SendResult> {
  if (!APNS_KEY_ID || !APNS_TEAM_ID || !APNS_PRIVATE_KEY || !APNS_BUNDLE_ID) {
    return { ok: false, reason: "other", error: "APNs not configured" };
  }

  let jwt: string;
  try {
    jwt = getJwt();
  } catch (err) {
    return { ok: false, reason: "other", error: String(err) };
  }

  // 1. まずメインの APNs サーバーに送信
  const primaryResult = await sendPushNotificationToHost(
    PRIMARY_APNS_HOST,
    deviceToken,
    payload,
    jwt,
  );
  if (primaryResult.ok) {
    return primaryResult;
  }

  // 2. 一次送信が「invalid_token（BadDeviceToken等）」の場合のみ、環境違い（Sandbox ↔ Production）の可能性を検証
  if (primaryResult.reason === "invalid_token") {
    const fallbackResult = await sendPushNotificationToHost(
      FALLBACK_APNS_HOST,
      deviceToken,
      payload,
      jwt,
    );
    if (fallbackResult.ok) {
      return fallbackResult;
    }
    // 両方の環境で失敗した場合：
    // フォールバック先でも invalid_token だった場合のみ「真の無効トークン」として削除対象にする
    if (fallbackResult.reason === "invalid_token") {
      return fallbackResult;
    }
    // フォールバック先がネットワーク等の "other" エラーの場合は安全側に倒して "other"（削除しない）にする
    return fallbackResult;
  }

  // PRIMARY が一時的ネットワーク障害やタイムアウト等の "other" だった場合は、
  // フォールバック先で BadDeviceToken と誤判定されて削除されないよう primaryResult（other）のまま返す
  return primaryResult;
}

// ---------------------------------------------------------------------------
// デバイストークン登録（userId と sessionId をキーとして token を上書き）
// ---------------------------------------------------------------------------

/**
 * userId と sessionId をID（識別子）として、デバイストークンを上書き保存する。
 * - 同じ token を保持している別セッション/他ユーザーの古いレコードがあれば重複を防ぐため削除。
 * - 同じ userId と sessionId を持つ行があれば token を上書き更新。
 * - なければ新規作成。
 */
export async function setDeviceTokenForSession(
  userId: string,
  sessionId: string,
  token: string,
): Promise<void> {
  const trimmed = token.trim();
  if (!trimmed) return;

  // 1. 同一トークンを持つ別セッションのレコードを削除（端末再ログイン時のユニーク制約エラー防止）
  await prisma.deviceToken.deleteMany({
    where: {
      token: trimmed,
      NOT: {
        userId,
        sessionId,
      },
    },
  });

  // 2. userId と sessionId をキーとして該当セッションの token を上書き
  const existing = await prisma.deviceToken.findFirst({
    where: { userId, sessionId },
  });

  if (existing) {
    await prisma.deviceToken.update({
      where: { id: existing.id },
      data: { token: trimmed },
    });
  } else {
    await prisma.deviceToken.create({
      data: {
        userId,
        sessionId,
        token: trimmed,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// フォロワー全員への送信
// ---------------------------------------------------------------------------

/**
 * `studyingUserId` のフォロワー全員にプッシュ通知を送る。
 * 無効なトークン（BadDeviceToken / Unregistered / BadEnvironmentKeyInToken等）は DB から自動削除する。
 * 送信失敗はエラーをスローせずに握りつぶす（呼び出し元のレスポンスに影響させない）。
 */
export async function sendToFollowers(
  studyingUserId: string,
  userName: string,
): Promise<void> {
  // ミュートしていないフォロワー一覧を取得（プッシュ通知設定で無効化されているユーザーは除外）
  const followers = await prisma.follow.findMany({
    where: {
      followingId: studyingUserId,
      muteStudyStartNotification: 0,
      follower: {
        OR: [
          { pushNotificationSetting: null },
          {
            pushNotificationSetting: {
              enabled: true,
              studyStart: true,
            },
          },
        ],
      },
    },
    select: { followerId: true },
  });
  if (followers.length === 0) return;

  const followerIds = followers.map((f) => f.followerId);

  // フォロワーのデバイストークンを取得
  const deviceTokens = await prisma.deviceToken.findMany({
    where: { userId: { in: followerIds } },
    select: { id: true, token: true, userId: true },
  });
  if (deviceTokens.length === 0) return;

  const payload: ApnsPayload = {
    aps: {
      alert: {
        title: "JunJun",
        "loc-key": "NOTIF_STUDY_START_TITLE",
        "loc-args": [userName],
      },
      sound: "default",
    },
  };

  // 全トークンに並列送信
  const results = await Promise.allSettled(
    deviceTokens.map(async (dt: { id: string; token: string; userId: string }) => {
      const result = await sendPushNotification(dt.token, payload);
      return { ...result, id: dt.id, token: dt.token };
    }),
  );

  // 無効なトークンを DB から削除
  const invalidIds = results
    .filter(
      (r): r is PromiseFulfilledResult<SendResult & { id: string; token: string }> =>
        r.status === "fulfilled",
    )
    .filter((r) => !r.value.ok && r.value.reason === "invalid_token")
    .map((r) => r.value.id);

  if (invalidIds.length > 0) {
    await prisma.deviceToken.deleteMany({ where: { id: { in: invalidIds } } });
  }
}

/**
 * 対象ユーザー（targetUserId）にフォロー通知を送る。
 * プッシュ通知設定で無効化されている場合は送信しない。
 * 無効なトークンは DB から自動削除する。
 * 送信失敗はエラーをスローせずに握りつぶす。
 */
export async function sendFollowNotification(
  targetUserId: string,
  actorName: string,
  actorId: string,
  notificationId?: string,
): Promise<void> {
  // 対象ユーザーのプッシュ通知設定をチェック
  const setting = await prisma.pushNotificationSetting.findUnique({
    where: { userId: targetUserId },
    select: { enabled: true, follow: true },
  });
  if (setting && (!setting.enabled || !setting.follow)) {
    return;
  }

  const deviceTokens = await prisma.deviceToken.findMany({
    where: { userId: targetUserId },
    select: { id: true, token: true, userId: true },
  });
  if (deviceTokens.length === 0) return;

  const payload: ApnsPayload = {
    aps: {
      alert: {
        title: "JunJun",
        "loc-key": "NOTIF_FOLLOW_BODY",
        "loc-args": [actorName],
      },
      sound: "default",
    },
    type: "FOLLOW",
    actorId,
    ...(notificationId ? { notificationId } : {}),
  };

  const results = await Promise.allSettled(
    deviceTokens.map(async (dt: { id: string; token: string; userId: string }) => {
      const result = await sendPushNotification(dt.token, payload);
      return { ...result, id: dt.id, token: dt.token };
    }),
  );

  const invalidIds = results
    .filter(
      (r): r is PromiseFulfilledResult<SendResult & { id: string; token: string }> =>
        r.status === "fulfilled",
    )
    .filter((r) => !r.value.ok && r.value.reason === "invalid_token")
    .map((r) => r.value.id);

  if (invalidIds.length > 0) {
    await prisma.deviceToken.deleteMany({ where: { id: { in: invalidIds } } });
  }
}

