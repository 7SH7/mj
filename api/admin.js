import crypto from 'node:crypto';
import { getCommunityMaps, removeCommunityMap } from './lib/storage.js';

const COOKIE = 'slip_admin_session';
const MAX_AGE = 60 * 60 * 8;
const LOGIN_WINDOW = 15 * 60 * 1000;
const LOGIN_LIMIT = 5;
const loginFailures = globalThis.__slipAdminFailures || new Map();
globalThis.__slipAdminFailures = loginFailures;

function bodyOf(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || '')), b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function secret() {
  return process.env.ADMIN_SESSION_SECRET || '';
}

function requestIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim().slice(0, 64);
}

function failureState(req) {
  const key = requestIp(req), now = Date.now();
  const current = loginFailures.get(key);
  if (!current || current.since + LOGIN_WINDOW < now) return { key, count: 0, since: now };
  return { key, ...current };
}

function signature(expires) {
  return crypto.createHmac('sha256', secret()).update(String(expires)).digest('base64url');
}

function authenticated(req) {
  if (!secret()) return false;
  const raw = String(req.headers.cookie || '').split(';').map(item => item.trim()).find(item => item.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!raw) return false;
  const [expires, given] = raw.split('.');
  return Number(expires) > Date.now() && safeEqual(given, signature(expires));
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  const body = bodyOf(req);
  if (req.method === 'POST' && body.action === 'login') {
    const failure = failureState(req);
    if (failure.count >= LOGIN_LIMIT) return res.status(429).json({ error: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.' });
    const valid = safeEqual(body.id, process.env.ADMIN_ID) && safeEqual(body.password, process.env.ADMIN_PASSWORD) && !!secret();
    if (!valid) {
      loginFailures.set(failure.key, { count: failure.count + 1, since: failure.since });
      return res.status(401).json({ error: '관리자 정보가 올바르지 않습니다.' });
    }
    loginFailures.delete(failure.key);
    const expires = Date.now() + MAX_AGE * 1000;
    res.setHeader('Set-Cookie', `${COOKIE}=${expires}.${signature(expires)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${MAX_AGE}`);
    return res.status(200).json({ ok: true });
  }
  if (req.method === 'POST' && body.action === 'logout') {
    res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
    return res.status(200).json({ ok: true });
  }
  if (!authenticated(req)) return res.status(401).json({ error: '관리자 로그인이 필요합니다.' });
  try {
    if (req.method === 'GET') return res.status(200).json({ maps: await getCommunityMaps() });
    if (req.method === 'DELETE') {
      const maps = await getCommunityMaps();
      const map = maps.find(item => item.communityCode === String(body.code || '').toUpperCase());
      if (!map) return res.status(404).json({ error: '맵을 찾을 수 없습니다.' });
      if (map.reportCount < 10) return res.status(403).json({ error: '신고가 10회 이상인 맵만 삭제할 수 있습니다.' });
      return res.status(200).json(await removeCommunityMap(map.communityCode));
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Admin API error', error);
    return res.status(500).json({ error: error?.message || '관리자 요청을 처리하지 못했습니다.' });
  }
}
