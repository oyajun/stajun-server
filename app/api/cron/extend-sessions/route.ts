import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api";

const SESSION_MAX_DAYS = 400;
const REFRESH_THRESHOLD_DAYS = 399;
const DAY_MS = 24 * 60 * 60 * 1000;

function isAuthorizedCron(request: Request): boolean | "missing_secret" {
  const secret = process.env.CRON_SECRET;
  if (!secret) return "missing_secret";

  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return false;

  const token = authHeader.slice("Bearer ".length);
  const tokenBuf = Buffer.from(token);
  const secretBuf = Buffer.from(secret);
  if (tokenBuf.length !== secretBuf.length) return false;

  return timingSafeEqual(tokenBuf, secretBuf);
}

/**
 * 期限切れ前かつ残り400日未満のセッションをすべて現在時刻+400日に延長する。
 * 長期間アプリを開いていない匿名ユーザー等のセッション切れを防ぐための定期実行用。
 */
async function handleExtendSessions(request: Request) {
  const authResult = isAuthorizedCron(request);
  if (authResult === "missing_secret") {
    return apiError(500, "SERVER_MISCONFIGURED", "CRON_SECRET が設定されていません。");
  }
  if (!authResult) {
    return apiError(401, "UNAUTHORIZED", "Cron 認証に失敗しました。");
  }

  const now = new Date();
  const threshold = new Date(now.getTime() + REFRESH_THRESHOLD_DAYS * DAY_MS);
  const newExpiresAt = new Date(now.getTime() + SESSION_MAX_DAYS * DAY_MS);

  const result = await prisma.session.updateMany({
    where: {
      expiresAt: {
        gt: now,
        lt: threshold,
      },
    },
    data: {
      expiresAt: newExpiresAt,
      updatedAt: now,
    },
  });

  return Response.json({
    ok: true,
    extendedCount: result.count,
    expiresAt: newExpiresAt.toISOString(),
  });
}

export async function POST(request: Request) {
  return handleExtendSessions(request);
}

export async function GET(request: Request) {
  return handleExtendSessions(request);
}
