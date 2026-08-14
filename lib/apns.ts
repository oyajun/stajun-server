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
}

// ---------------------------------------------------------------------------
// 単一デバイスへの送信
// ---------------------------------------------------------------------------

type SendResult =
  | { ok: true }
  | { ok: false; reason: "invalid_token" | "other"; error?: string };

async function sendPushNotificationToHost(
  host: string,
  deviceToken: string,
  payload: ApnsPayload,
  jwt: string,
): Promise<SendResult> {
  return new Promise((resolve) => {
    const client = connect(`https://${host}`);

    client.on("error", (err) => {
      client.destroy();
      resolve({ ok: false, reason: "other", error: String(err) });
    });

    const body = JSON.stringify(payload);
    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      ":scheme": "https",
      ":authority": host,
      authorization: `bearer ${jwt}`,
      "apns-topic": APNS_BUNDLE_ID,
      "apns-push-type": "alert",
      "content-type": "application/json",
      "content-length": Buffer.byteLength(body),
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
      client.close();
      if (statusCode === 200) {
        resolve({ ok: true });
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
        resolve({
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
 * メインの環境（本番/Sandbox）で失敗した場合、フォールバック環境でも試行する。
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

  // 2. エラーの場合、環境違い（Sandbox ↔ Production）の可能性があるのでフォールバック
  const fallbackResult = await sendPushNotificationToHost(
    FALLBACK_APNS_HOST,
    deviceToken,
    payload,
    jwt,
  );
  return fallbackResult;
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
  // フォロワー一覧を取得
  const followers = await prisma.follow.findMany({
    where: { followingId: studyingUserId },
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
