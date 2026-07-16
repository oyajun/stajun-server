import { randomBytes, randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";

// テストデータはこのメールドメインで識別し、まとめて掃除する
export const TEST_EMAIL_DOMAIN = "@vitest.stajun.test";

type CreateUserOpts = {
  /** 設定するとオンボーディング完了ユーザーになる（未指定は username=null の未完了ユーザー） */
  username?: string;
  iconEmoji?: string;
  iconBackgroundColor?: string;
  /** セッション作成時刻を過去にずらす（フレッシュ判定テスト用）。日数指定。 */
  sessionAgeDays?: number;
};

export type TestUser = {
  id: string;
  token: string;
  username: string | null;
};

/** テスト用のユーザー + セッションを実DBに作成し、bearerトークン（=生のsession.token）を返す */
export async function createUser(opts: CreateUserOpts = {}): Promise<TestUser> {
  const id = randomUUID();
  const email = `u-${id}${TEST_EMAIL_DOMAIN}`;
  const username = opts.username ?? null;

  await prisma.user.create({
    data: {
      id,
      name: username ?? "",
      email,
      emailVerified: true,
      username,
      iconEmoji: opts.iconEmoji ?? null,
      iconBackgroundColor: opts.iconBackgroundColor ?? null,
    },
  });

  const token = randomBytes(24).toString("hex"); // ドットを含まない生トークン
  const now = Date.now();
  const createdAt = new Date(
    now - (opts.sessionAgeDays ?? 0) * 24 * 60 * 60 * 1000,
  );
  await prisma.session.create({
    data: {
      id: randomUUID(),
      userId: id,
      token,
      createdAt,
      expiresAt: new Date(now + 7 * 24 * 60 * 60 * 1000),
    },
  });

  return { id, token, username };
}

/** テスト用データ（このドメインのユーザーと従属レコード）を全削除 */
export async function cleanupTestData(): Promise<void> {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: TEST_EMAIL_DOMAIN } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length === 0) return;

  await prisma.follow.deleteMany({
    where: { OR: [{ followerId: { in: ids } }, { followingId: { in: ids } }] },
  });
  await prisma.studySession.deleteMany({ where: { userId: { in: ids } } });
  await prisma.studyPost.deleteMany({ where: { userId: { in: ids } } });
  await prisma.session.deleteMany({ where: { userId: { in: ids } } });
  await prisma.account.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

/** bearerトークン付きの Request を組み立てる */
export function apiRequest(
  method: string,
  opts: { token?: string; body?: unknown; query?: Record<string, string> } = {},
): Request {
  const headers = new Headers();
  if (opts.token) headers.set("Authorization", `Bearer ${opts.token}`);
  let body: string | undefined;
  if (opts.body !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(opts.body);
  }
  // パスは実装が参照しないためダミーで固定（query 指定時のみクエリを付与）
  const url = new URL("http://test.local/api");
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      url.searchParams.set(k, v);
    }
  }
  return new Request(url, { method, headers, body });
}

/** 動的ルートの ctx（params は Promise）を作る */
export function routeCtx<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) } as { params: Promise<T> };
}

/** Response の status と JSON body をまとめて取り出す */
export async function readResponse(
  res: Response,
): Promise<{ status: number; body: any }> {
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: res.status, body };
}
