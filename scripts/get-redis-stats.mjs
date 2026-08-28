import dotenv from 'dotenv';
dotenv.config();

import { Redis } from '@upstash/redis';

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!url || !token) {
  console.error('UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN is missing in environment/.env');
  process.exit(1);
}

const redis = new Redis({ url, token });

async function main() {
  console.log('Connecting to Upstash Redis...');

  let dbsize = 0;
  try {
    dbsize = await redis.dbsize();
  } catch (e) {
    console.warn('dbsize failed:', e.message);
  }

  let cursor = "0";
  const allKeys = [];
  do {
    const res = await redis.scan(cursor, { count: 100 });
    cursor = String(res[0]);
    allKeys.push(...res[1]);
  } while (cursor !== "0");

  const dailyKeys = allKeys.filter(k => k.startsWith('api:daily:'));
  const totalKeys = allKeys.filter(k => k.startsWith('api:total:'));
  const otherKeys = allKeys.filter(k => !k.startsWith('api:daily:') && !k.startsWith('api:total:'));

  console.log(`\n========================================`);
  console.log(`  Upstash Redis 統計サマリー`);
  console.log(`========================================`);
  console.log(`・総キー数: ${allKeys.length} (DBSize: ${dbsize})`);
  console.log(`・累計キー数 (api:total:*): ${totalKeys.length}`);
  console.log(`・日別キー数 (api:daily:*): ${dailyKeys.length}`);
  console.log(`・その他のキー数: ${otherKeys.length}`);

  let totalApiRequests = 0;
  const endpointTotals = [];
  if (totalKeys.length > 0) {
    const mgetValues = await redis.mget(...totalKeys);
    totalKeys.forEach((k, idx) => {
      const val = parseInt(mgetValues[idx] ?? '0', 10);
      totalApiRequests += val;
      const parts = k.split(':');
      const method = parts[2];
      const path = parts.slice(3).join(':');
      endpointTotals.push({ method, path, count: val, key: k });
    });
    endpointTotals.sort((a, b) => b.count - a.count);
  }

  console.log(`\n■ 記録された累計 API リクエスト総数: ${totalApiRequests.toLocaleString()} 回`);

  // 日別集計
  const dayMap = {};
  const dayEndpointMap = {};
  if (dailyKeys.length > 0) {
    const dailyMget = await redis.mget(...dailyKeys);
    dailyKeys.forEach((k, idx) => {
      const val = parseInt(dailyMget[idx] ?? '0', 10);
      const parts = k.split(':');
      const date = parts[2];
      const method = parts[3];
      const path = parts.slice(4).join(':');

      dayMap[date] = (dayMap[date] || 0) + val;
      if (!dayEndpointMap[date]) dayEndpointMap[date] = [];
      dayEndpointMap[date].push({ method, path, count: val });
    });
  }

  const sortedDates = Object.keys(dayMap).sort().reverse();
  console.log(`\n■ 日別リクエスト推移 (直近):`);
  console.table(sortedDates.map(date => ({
    日付: date,
    リクエスト数: dayMap[date],
    割合: `${((dayMap[date] / totalApiRequests) * 100).toFixed(1)}%`
  })));

  console.log(`\n■ 累計リクエスト数ランキング (Top 20):`);
  console.table(endpointTotals.slice(0, 20).map((e, idx) => ({
    順位: idx + 1,
    Method: e.method,
    Endpoint: e.path,
    リクエスト数: e.count,
    シェア: `${((e.count / totalApiRequests) * 100).toFixed(1)}%`
  })));

  for (const date of sortedDates) {
    console.log(`\n----------------------------------------`);
    console.log(`■ ${date} の内訳 (合計: ${dayMap[date]} 件)`);
    console.log(`----------------------------------------`);
    dayEndpointMap[date].sort((a, b) => b.count - a.count);
    console.table(dayEndpointMap[date].map(e => ({
      Method: e.method,
      Endpoint: e.path,
      Requests: e.count,
      シェア: `${((e.count / dayMap[date]) * 100).toFixed(1)}%`
    })));
  }

  if (otherKeys.length > 0) {
    console.log('\n■ その他のキー:');
    for (const key of otherKeys) {
      try {
        const type = await redis.type(key);
        console.log(`Key: ${key} (type: ${type})`);
      } catch (e) {}
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
