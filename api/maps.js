import { getCommunityMaps, publishMap, rateMap, reportMap } from './lib/storage.js';

const WRITE_WINDOW = 60 * 1000;
const WRITE_LIMIT = 30;
const writeCounts = globalThis.__slipMapWrites || new Map();
globalThis.__slipMapWrites = writeCounts;

function bodyOf(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}

function allowWrite(req) {
  const key = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim().slice(0, 64);
  const now = Date.now(), current = writeCounts.get(key);
  const next = !current || current.since + WRITE_WINDOW < now ? { count: 1, since: now } : { count: current.count + 1, since: current.since };
  writeCounts.set(key, next);
  return next.count <= WRITE_LIMIT;
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=60');
      return res.status(200).json({ maps: await getCommunityMaps() });
    }
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!allowWrite(req)) return res.status(429).json({ error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' });
    if (Number(req.headers['content-length'] || 0) > 50000) return res.status(413).json({ error: '요청 데이터가 너무 큽니다.' });
    const body = bodyOf(req);
    if (body.action === 'publish') return res.status(201).json(await publishMap(body.code, body.map));
    if (body.action === 'rate') return res.status(200).json(await rateMap(body.code, body.clientId, body.rating));
    if (body.action === 'report') return res.status(200).json(await reportMap(body.code, body.clientId));
    return res.status(400).json({ error: 'Unknown action' });
  } catch (error) {
    console.error('Community map API error', error);
    return res.status(400).json({ error: error?.message || '요청을 처리하지 못했습니다.' });
  }
}
