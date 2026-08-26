import { Redis } from '@upstash/redis';

let _redis: Redis | null = null;

export function getRedisClient(): Redis | null {
  if (!_redis && process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    _redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return _redis;
}

/**
 * API パス内の動的パラメータ（ID 等）を `:id` に正規化する
 * 例: /api/v1/posts/cm8abc123/report -> /api/v1/posts/:id/report
 * 例: /api/v1/notifications/cly456/read -> /api/v1/notifications/:id/read
 */
export function normalizeApiPath(pathname: string): string {
  const cleanPath = pathname.split('?')[0].replace(/\/$/, '') || '/';

  // better-auth の認証エンドポイント (/api/auth/...) は動的 ID を含まないため、そのままのパスで集計する
  if (cleanPath.startsWith('/api/auth')) {
    return cleanPath;
  }

  const segments = cleanPath.split('/');

  const knownWords = new Set([
    '',
    'api',
    'v1',
    'posts',
    'notifications',
    'unread-count',
    'read',
    'report',
    'block',
    'blocks',
    'follow',
    'mute',
    'followers',
    'following',
    'users',
    'stats',
    'series',
    'me',
    'profile',
    'study-sessions',
    'start',
    'stop',
    'settings',
    'push-notifications',
    'account',
    'apns-token',
    'search',
    'recommended',
  ]);

  return segments
    .map((seg, idx) => {
      if (idx <= 2) return seg; // '', 'api', 'v1' など先頭はそのまま
      if (knownWords.has(seg)) return seg;
      return ':id';
    })
    .join('/');
}

/**
 * API アクセスを Upstash Redis に記録する
 * - 日別集計（30日間保持）
 * - 累計集計
 * パイプライン化により 1 回の HTTP リクエストでまとめて送信し、無料枠消費とオーバーヘッドを最小化
 */
export async function trackApiAccess(method: string, pathname: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;

  try {
    const normalized = normalizeApiPath(pathname);
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const methodUpper = method.toUpperCase();

    const dailyKey = `api:daily:${today}:${methodUpper}:${normalized}`;
    const totalKey = `api:total:${methodUpper}:${normalized}`;

    const pipeline = redis.pipeline();
    pipeline.incr(dailyKey);
    pipeline.expire(dailyKey, 60 * 60 * 24 * 30); // 30日 TTL
    pipeline.incr(totalKey);
    await pipeline.exec();
  } catch (error) {
    // アクセス計測のエラーで本来の API レスポンスに影響が出ないよう安全に記録
    console.error('[API_METRICS_ERROR]', error);
  }
}

