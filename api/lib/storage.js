import crypto from 'node:crypto';
import { BlobNotFoundError, get, head, put } from '@vercel/blob';

const STATE_PATH = 'community/state.json';
const MAX_COMMUNITY_MAPS = 300;
const MAX_RATINGS_PER_MAP = 2000;
const MAX_REPORTS_PER_MAP = 200;
const EMPTY_STATE = () => ({ version: 1, maps: {} });

function conflict(error) {
  const value = `${error?.statusCode || ''} ${error?.message || error}`.toLowerCase();
  return value.includes('409') || value.includes('412') || value.includes('exist') || value.includes('match') || value.includes('precondition');
}

async function readState() {
  const result = await get(STATE_PATH, { access: 'private', useCache: false });
  if (!result) return { state: EMPTY_STATE(), etag: null };
  try {
    const state = await new Response(result.stream).json();
    if (!state || state.version !== 1 || !state.maps || typeof state.maps !== 'object') throw new Error('Invalid state');
    return { state, etag: result.blob.etag };
  } catch {
    throw new Error('공유 맵 저장소를 읽을 수 없습니다.');
  }
}

async function headState() {
  try { return await head(STATE_PATH); }
  catch (error) {
    if (error instanceof BlobNotFoundError || `${error?.statusCode || ''} ${error?.message || error}`.includes('404')) return null;
    throw error;
  }
}

async function readVersionedState() {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const before = await headState();
    const current = await readState();
    if (!!before === !!current.etag) return { state: current.state, etag: before?.etag || null };
    await new Promise(resolve => setTimeout(resolve, 25 * (attempt + 1)));
  }
  throw new Error('공유 맵 저장소가 갱신 중입니다. 다시 시도해 주세요.');
}

async function changeState(update) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const base = await readVersionedState();
    const state = structuredClone(base.state), etag = base.etag;
    const result = update(state);
    try {
      await put(STATE_PATH, JSON.stringify(state), {
        access: 'private', addRandomSuffix: false, allowOverwrite: !!etag,
        ...(etag ? { ifMatch: etag } : {}),
        contentType: 'application/json', cacheControlMaxAge: 60
      });
      return result;
    } catch (error) {
      if (!conflict(error) || attempt === 9) throw error;
      await new Promise(resolve => setTimeout(resolve, Math.min(1000, 40 * (2 ** attempt))));
    }
  }
  throw new Error('공유 맵 저장 충돌이 발생했습니다. 다시 시도해 주세요.');
}

export function cleanCode(value) {
  const code = String(value || '').toUpperCase().replace(/[^2-9A-HJ-NP-Z]/g, '').slice(0, 6);
  if (code.length !== 6) throw new Error('올바르지 않은 맵 코드입니다.');
  return code;
}

export function cleanClientId(value) {
  const id = String(value || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 64);
  if (id.length < 8) throw new Error('사용자 식별값이 올바르지 않습니다.');
  return id;
}

function clientKey(value) {
  return `u_${crypto.createHash('sha256').update(cleanClientId(value)).digest('hex').slice(0, 32)}`;
}

function validPoint(value) {
  return value && Number.isFinite(Number(value.x)) && Number.isFinite(Number(value.y));
}

export function validateSharedMap(value) {
  if (!value || value.verified !== true || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 30) return null;
  if (!Number.isInteger(Number(value.difficulty)) || value.difficulty < 1 || value.difficulty > 5) return null;
  if (!value.layout || !validPoint(value.layout.spawn) || !validPoint(value.layout.exit)) return null;
  if (!Array.isArray(value.layout.floors) || !value.layout.floors.length || value.layout.floors.length > 64) return null;
  if (!Array.isArray(value.layout.objects) || value.layout.objects.length > 80) return null;
  const encoded = JSON.stringify(value);
  if (encoded.length > 40000) return null;
  return JSON.parse(encoded);
}

function publicMap(code, entry) {
  const ratings = Object.values(entry.ratings || {}).filter(rating => Number.isInteger(rating) && rating >= 1 && rating <= 5);
  const average = ratings.length ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : 0;
  return {
    ...entry.map,
    communityCode: code,
    rating: { average: Number(average.toFixed(1)), count: ratings.length },
    reportCount: Object.keys(entry.reports || {}).length
  };
}

export async function getCommunityMaps() {
  const { state } = await readState();
  return Object.entries(state.maps)
    .map(([code, entry]) => publicMap(code, entry))
    .sort((a, b) => String(b.verifiedAt || b.createdAt).localeCompare(String(a.verifiedAt || a.createdAt)));
}

export async function publishMap(codeValue, mapValue) {
  const code = cleanCode(codeValue);
  const map = validateSharedMap(mapValue);
  if (!map) throw new Error('공유할 수 없는 맵 데이터입니다.');
  return changeState(state => {
    if (!state.maps[code]) {
      if (Object.keys(state.maps).length >= MAX_COMMUNITY_MAPS) throw new Error('공유 맵 저장 한도에 도달했습니다.');
      state.maps[code] = { map, ratings: {}, reports: {} };
    }
    return { code };
  });
}

export async function rateMap(codeValue, clientValue, ratingValue) {
  const code = cleanCode(codeValue), clientId = clientKey(clientValue);
  const rating = Number(ratingValue);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error('별점은 1~5점이어야 합니다.');
  return changeState(state => {
    const entry = state.maps[code];
    if (!entry) throw new Error('맵을 찾을 수 없습니다.');
    entry.ratings ||= {};
    if (!(clientId in entry.ratings) && Object.keys(entry.ratings).length >= MAX_RATINGS_PER_MAP) throw new Error('이 맵의 별점 저장 한도에 도달했습니다.');
    entry.ratings[clientId] = rating;
    return { code, rating };
  });
}

export async function reportMap(codeValue, clientValue) {
  const code = cleanCode(codeValue), clientId = clientKey(clientValue);
  return changeState(state => {
    const entry = state.maps[code];
    if (!entry) throw new Error('맵을 찾을 수 없습니다.');
    entry.reports ||= {};
    const counted = !entry.reports[clientId];
    if (counted && Object.keys(entry.reports).length >= MAX_REPORTS_PER_MAP) throw new Error('이 맵의 신고 저장 한도에 도달했습니다.');
    entry.reports[clientId] = new Date().toISOString();
    return { code, counted };
  });
}

export async function removeCommunityMap(codeValue) {
  const code = cleanCode(codeValue);
  return changeState(state => {
    const entry = state.maps[code];
    if (!entry) throw new Error('맵을 찾을 수 없습니다.');
    if (Object.keys(entry.reports || {}).length < 10) throw new Error('신고가 10회 이상인 맵만 삭제할 수 있습니다.');
    delete state.maps[code];
    return { code, deleted: true };
  });
}
