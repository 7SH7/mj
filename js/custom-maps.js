'use strict';

// SLIP OUT: authored custom-map storage and validation.
(function exposeCustomMapStore(global) {
  const VERSION = 3;
  const UNLOCK_CLEAR_COUNT = 3;
  const MAX_MAPS = 40;
  const MAX_NAME_LENGTH = 30;
  const MAX_OBJECTS = 80;
  const MAX_FLOORS = 64;
  const MAX_REVIEWS_PER_MAP = 100;
  const MAPS_KEY = 'slip-out-custom-maps-v1';
  const PROGRESS_KEY = 'slip-out-custom-progress-v1';
  const REVIEWS_KEY = 'slip-out-custom-reviews-v1';
  const WORLD_BOUNDS = { minX: 160, maxX: 8440, minY: 250, maxY: 1350 };
  const OBJECT_TYPES = new Set(['checkpoint', 'pillar', 'bumper', 'rotor', 'shockwave', 'laser', 'gate', 'boost', 'hole', 'enemy']);
  const FLOOR_TYPES = new Set(['safe', 'ice', 'black']);
  const SAFE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const status = { storageMode: 'memory', lastStorageError: null };

  const copy = value => JSON.parse(JSON.stringify(value));
  const clampValue = (value, min, max) => Math.max(min, Math.min(max, value));
  const finite = value => Number.isFinite(Number(value));
  const point = value => value && finite(value.x) && finite(value.y)
    ? { x: Math.round(clampValue(Number(value.x), WORLD_BOUNDS.minX, WORLD_BOUNDS.maxX)), y: Math.round(clampValue(Number(value.y), WORLD_BOUNDS.minY, WORLD_BOUNDS.maxY)) }
    : null;

  function hashText(text) {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index++) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function storageRead(key, fallback) {
    try {
      if (!global.localStorage) return copy(fallback);
      const raw = global.localStorage.getItem(key);
      status.storageMode = 'localStorage'; status.lastStorageError = null;
      return raw === null ? copy(fallback) : JSON.parse(raw);
    } catch (error) {
      status.storageMode = 'memory'; status.lastStorageError = String(error?.message || error);
      return copy(fallback);
    }
  }

  function storageWrite(key, value) {
    try {
      if (!global.localStorage) return false;
      global.localStorage.setItem(key, JSON.stringify(value));
      status.storageMode = 'localStorage'; status.lastStorageError = null;
      return true;
    } catch (error) {
      status.storageMode = 'memory'; status.lastStorageError = String(error?.message || error);
      return false;
    }
  }

  function normalizeProgress(value) {
    const fullClears = Number.isInteger(value?.fullClears) ? clampValue(value.fullClears, 0, 999999) : 0;
    const clearedRuns = Array.isArray(value?.clearedRuns) ? value.clearedRuns.filter(item => typeof item === 'string').slice(-100) : [];
    return { fullClears, clearedRuns };
  }

  function normalizeObject(value) {
    if (!value || !OBJECT_TYPES.has(value.type)) return null;
    const position = point(value);
    if (!position) return null;
    return { type: value.type, ...position };
  }

  function normalizeFloor(value) {
    if (!value || !FLOOR_TYPES.has(value.type) || !finite(value.x) || !finite(value.y) || !finite(value.w) || !finite(value.h)) return null;
    const w = clampValue(Math.round(Number(value.w)), 200, 1600);
    const h = clampValue(Math.round(Number(value.h)), 200, 900);
    return {
      x: Math.round(clampValue(Number(value.x), 80, 8520 - w)),
      y: Math.round(clampValue(Number(value.y), 180, 1420 - h)),
      w, h, type: value.type, zone: 0
    };
  }

  function normalizeLayout(value) {
    if (!value || typeof value !== 'object') return null;
    const spawn = point(value.spawn);
    const exitPoint = point(value.exit);
    if (!spawn || !exitPoint) return null;
    const exit = { ...exitPoint, r: clampValue(Math.round(Number(value.exit.r) || 118), 90, 145) };
    const objects = Array.isArray(value.objects) ? value.objects.map(normalizeObject).filter(Boolean).slice(0, MAX_OBJECTS) : [];
    const floors = Array.isArray(value.floors)
      ? value.floors.map(normalizeFloor).filter(Boolean).slice(0, MAX_FLOORS)
      : [{ x: 80, y: 180, w: 8440, h: 1240, type: 'ice', zone: 0 }];
    return { spawn, exit, floors, objects };
  }

  function legacyLayout(map) {
    // Previously registered seed maps remain playable, but all newly authored maps use explicit placements.
    const difficulty = clampValue(Number(map.difficulty) || 1, 1, 5);
    const objects = [];
    for (let index = 0; index < difficulty + 2; index++) {
      objects.push({ type: index % 3 === 0 ? 'rotor' : index % 3 === 1 ? 'bumper' : 'pillar', x: 1500 + index * (5300 / (difficulty + 1)), y: index % 2 ? 1050 : 550 });
    }
    return { spawn: { x: 430, y: 800 }, exit: { x: 8220, y: 800, r: 118 }, floors: [{ x: 80, y: 180, w: 8440, h: 1240, type: 'ice', zone: 0 }], objects };
  }

  function normalizedMap(value, options = {}) {
    if (!value || typeof value !== 'object') return null;
    const name = typeof value.name === 'string' ? value.name.trim() : '';
    const difficulty = Number(value.difficulty);
    const createdAt = typeof value.createdAt === 'string' && !Number.isNaN(Date.parse(value.createdAt)) ? new Date(value.createdAt).toISOString() : null;
    const id = typeof value.id === 'string' ? value.id.trim() : '';
    const layout = normalizeLayout(value.layout) || (finite(value.seed) ? legacyLayout(value) : null);
    if (!name || name.length > MAX_NAME_LENGTH || !Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5 || !createdAt || !layout) return null;
    if (!/^(?:cm|draft|shared)_[a-z0-9_-]{3,63}$/i.test(id)) return null;
    const verified = value.verified === true || (finite(value.seed) && !value.layout);
    if (options.requireVerified && !verified) return null;
    const result = { id, name, difficulty, createdAt, verified, layout };
    if (verified) result.verifiedAt = typeof value.verifiedAt === 'string' && !Number.isNaN(Date.parse(value.verifiedAt)) ? new Date(value.verifiedAt).toISOString() : createdAt;
    return options.freeze ? Object.freeze(result) : result;
  }

  function validateLayout(value) {
    const layout = normalizeLayout(value);
    if (!layout) return { valid: false, message: '시작점과 종료 존을 맵 위에 지정해 주세요.' };
    if (!layout.floors.length) return { valid: false, message: '바닥이 없습니다. 바닥 도구로 길을 먼저 배치해 주세요.' };
    const hasFloor = pointValue => layout.floors.some(floor => pointValue.x >= floor.x && pointValue.x <= floor.x + floor.w && pointValue.y >= floor.y && pointValue.y <= floor.y + floor.h);
    if (!hasFloor(layout.spawn) || !hasFloor(layout.exit)) return { valid: false, message: '시작점과 종료 존은 배치한 바닥 위에 놓아 주세요.' };
    if (layout.exit.x - layout.spawn.x < 1200) return { valid: false, message: '종료 존은 시작점보다 충분히 오른쪽에 놓아 주세요.' };
    const hazards = layout.objects.filter(item => item.type !== 'checkpoint');
    if (!hazards.length) return { valid: false, message: '장애물을 1개 이상 배치해 주세요.' };
    const checkpoints = layout.objects.filter(item => item.type === 'checkpoint');
    if (checkpoints.length > 4) return { valid: false, message: '체크포인트는 최대 4개까지 배치할 수 있습니다.' };
    if (checkpoints.some(item => item.x <= layout.spawn.x + 300 || item.x >= layout.exit.x - 300)) return { valid: false, message: '체크포인트는 시작점과 종료 존 사이에 놓아 주세요.' };
    const safetyPoints = [layout.spawn, layout.exit, ...checkpoints];
    const unsafe = hazards.some(item => safetyPoints.some(safe => Math.hypot(item.x - safe.x, item.y - safe.y) < (item.type === 'hole' ? 180 : 125)));
    if (unsafe) return { valid: false, message: '시작점·종료 존·체크포인트 주변의 장애물을 조금 떼어 주세요.' };
    return { valid: true, message: `테스트 가능 · 장애물 ${hazards.length}개${checkpoints.length ? ` · 체크포인트 ${checkpoints.length}개` : ''}`, layout };
  }

  function normalizeMaps(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    return value.map(item => normalizedMap(item, { requireVerified: true })).filter(item => {
      if (!item || seen.has(item.id) || seen.size >= MAX_MAPS) return false;
      seen.add(item.id); return true;
    });
  }

  let progress = normalizeProgress(storageRead(PROGRESS_KEY, { fullClears: 0, clearedRuns: [] }));
  let maps = normalizeMaps(storageRead(MAPS_KEY, []));
  function normalizeReview(value) {
    if (!value || !Number.isInteger(Number(value.rating)) || Number(value.rating) < 1 || Number(value.rating) > 5) return null;
    const createdAt = typeof value.createdAt === 'string' && !Number.isNaN(Date.parse(value.createdAt)) ? new Date(value.createdAt).toISOString() : new Date().toISOString();
    const runId = typeof value.runId === 'string' ? value.runId.trim().slice(0, 80) : '';
    return { rating: Number(value.rating), runId, createdAt };
  }
  function normalizeReviews(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).map(([code, items]) => [
      String(code).slice(0, 12),
      Array.isArray(items) ? items.map(normalizeReview).filter(Boolean).slice(-MAX_REVIEWS_PER_MAP) : []
    ]).filter(([, items]) => items.length));
  }
  let reviews = normalizeReviews(storageRead(REVIEWS_KEY, {}));
  storageWrite(MAPS_KEY, maps);
  storageWrite(REVIEWS_KEY, reviews);
  const persistMaps = () => storageWrite(MAPS_KEY, maps);
  const persistProgress = () => storageWrite(PROGRESS_KEY, progress);
  const persistReviews = () => storageWrite(REVIEWS_KEY, reviews);
  const isUnlocked = () => progress.fullClears >= UNLOCK_CLEAR_COUNT;
  const unlockProgress = () => ({ fullClears: progress.fullClears, requiredClears: UNLOCK_CLEAR_COUNT, remainingClears: Math.max(0, UNLOCK_CLEAR_COUNT - progress.fullClears), unlocked: isUnlocked() });

  function recordFullClear(runId) {
    const before = isUnlocked();
    const normalizedRunId = typeof runId === 'string' ? runId.trim().slice(0, 80) : '';
    if (normalizedRunId && progress.clearedRuns.includes(normalizedRunId)) return { ...unlockProgress(), counted: false, newlyUnlocked: false };
    progress.fullClears += 1;
    if (normalizedRunId) progress.clearedRuns.push(normalizedRunId);
    progress.clearedRuns = progress.clearedRuns.slice(-100); persistProgress();
    return { ...unlockProgress(), counted: true, newlyUnlocked: !before && isUnlocked() };
  }

  function requireUnlocked() {
    if (isUnlocked()) return;
    const error = new Error(`커스텀 맵은 전체 클리어 ${UNLOCK_CLEAR_COUNT}회 후 해금됩니다.`);
    error.code = 'CUSTOM_MAP_LOCKED'; throw error;
  }

  function makeId(prefix, name, layout, createdAt) {
    const fingerprint = hashText(`${name}|${JSON.stringify(layout)}|${createdAt}`).toString(36).padStart(7, '0').slice(-7);
    const base = `${prefix}_${Date.parse(createdAt).toString(36)}_${fingerprint}`;
    let id = base, counter = 1;
    while (maps.some(item => item.id === id)) id = `${base.slice(0, 58)}_${counter++}`;
    return id;
  }

  function createDraft(input = {}) {
    requireUnlocked();
    const validation = validateLayout(input.layout);
    if (!validation.valid) throw Object.assign(new TypeError(validation.message), { code: 'INVALID_CUSTOM_LAYOUT' });
    const createdAt = new Date().toISOString();
    const candidate = {
      id: makeId('draft', String(input.name || ''), validation.layout, createdAt),
      name: String(input.name || '').trim(), difficulty: Number(input.difficulty), createdAt,
      verified: false, layout: validation.layout
    };
    const draft = normalizedMap(candidate);
    if (!draft) throw Object.assign(new TypeError('맵 이름(1~30자)과 난이도(1~5)를 확인해 주세요.'), { code: 'INVALID_CUSTOM_MAP' });
    return copy(draft);
  }

  // Kept as a compatibility alias; drafts are never included in list() until registerVerified succeeds.
  const create = input => createDraft(input);

  function registerVerified(draftValue, proof) {
    requireUnlocked();
    if (maps.length >= MAX_MAPS) throw Object.assign(new Error(`커스텀 맵은 최대 ${MAX_MAPS}개까지 저장할 수 있습니다.`), { code: 'CUSTOM_MAP_LIMIT' });
    const draft = normalizedMap(draftValue);
    if (!draft || draft.verified || !proof || proof.fullClear !== true || proof.creatorTest !== true || typeof proof.runId !== 'string' || !proof.runId) {
      throw Object.assign(new Error('제작자 테스트 클리어가 확인되어야 맵을 등록할 수 있습니다.'), { code: 'CUSTOM_MAP_NOT_VERIFIED' });
    }
    const verifiedAt = new Date().toISOString();
    const map = normalizedMap({ ...draft, id: makeId('cm', draft.name, draft.layout, verifiedAt), verified: true, verifiedAt }, { requireVerified: true });
    maps.push(map); persistMaps(); return copy(map);
  }

  const list = () => maps.slice().sort((a, b) => b.verifiedAt.localeCompare(a.verifiedAt)).map(copy);
  const get = id => { const found = maps.find(item => item.id === id); return found ? copy(found) : null; };

  function update(id, changes = {}) {
    requireUnlocked();
    const index = maps.findIndex(item => item.id === id);
    if (index < 0) return null;
    if (changes.layout !== undefined && JSON.stringify(normalizeLayout(changes.layout)) !== JSON.stringify(maps[index].layout)) {
      throw Object.assign(new Error('배치를 수정한 맵은 다시 테스트 클리어해야 합니다.'), { code: 'CUSTOM_MAP_REVERIFY_REQUIRED' });
    }
    const map = normalizedMap({ ...maps[index], name: changes.name === undefined ? maps[index].name : String(changes.name).trim(), difficulty: changes.difficulty === undefined ? maps[index].difficulty : Number(changes.difficulty) }, { requireVerified: true });
    if (!map) throw new TypeError('맵 이름과 난이도를 확인해 주세요.');
    maps[index] = map; persistMaps(); return copy(map);
  }

  function remove(id) {
    requireUnlocked();
    const index = maps.findIndex(item => item.id === id);
    if (index < 0) return false;
    maps.splice(index, 1); persistMaps(); return true;
  }

  function serialize(mapValue) {
    const map = typeof mapValue === 'string' ? get(mapValue) : normalizedMap(mapValue);
    if (!map) throw new TypeError('공유할 수 없는 커스텀 맵입니다.');
    const layout = { spawn: map.layout.spawn, exit: map.layout.exit, objects: map.layout.objects };
    if (map.layout.floors?.length) layout.floors = map.layout.floors;
    let value = hashText(JSON.stringify({ name: map.name, difficulty: map.difficulty, layout }));
    let code = '';
    for (let index = 0; index < 6; index++) { code = SAFE_ALPHABET[value & 31] + code; value >>>= 5; }
    return code;
  }

  function deserialize(code) {
    const normalizedCode = String(code || '').trim().toUpperCase();
    const found = maps.find(map => serialize(map) === normalizedCode);
    return found ? copy(found) : null;
  }

  function reviewCode(mapValue) {
    const map = typeof mapValue === 'string' ? (get(mapValue) || deserialize(mapValue)) : normalizedMap(mapValue);
    if (!map) throw new TypeError('평가할 수 없는 커스텀 맵입니다.');
    return serialize(map);
  }

  function getRating(mapValue) {
    let code;
    try { code = reviewCode(mapValue); } catch { return { average: 0, count: 0, reviews: [] }; }
    const items = reviews[code] || [];
    const average = items.length ? items.reduce((sum, item) => sum + item.rating, 0) / items.length : 0;
    return { average: Number(average.toFixed(1)), count: items.length, reviews: items.slice().reverse().map(copy) };
  }

  function addReview(mapValue, input = {}) {
    const code = reviewCode(mapValue);
    const review = normalizeReview({ ...input, createdAt: new Date().toISOString() });
    if (!review) throw new TypeError('별점은 1점부터 5점까지 선택해 주세요.');
    const items = reviews[code] || [];
    const sameRun = review.runId ? items.findIndex(item => item.runId === review.runId) : -1;
    if (sameRun >= 0) items[sameRun] = review;
    else items.push(review);
    reviews[code] = items.slice(-MAX_REVIEWS_PER_MAP);
    persistReviews();
    return getRating(mapValue);
  }

  function generate(mapValue) {
    const map = typeof mapValue === 'string' ? (get(mapValue) || deserialize(mapValue)) : normalizedMap(mapValue);
    if (!map) throw Object.assign(new TypeError('생성할 수 없는 커스텀 맵입니다.'), { code: 'INVALID_CUSTOM_MAP' });
    const difficulty = map.difficulty;
    const hazards = { winds: [], shockwaves: [], lasers: [], bumpers: [], rotors: [], movers: [], gates: [], launchers: [], pillars: [], collapse: [], boostPads: [], slowPads: [], holes: [] };
    const enemies = [];
    const checkpoints = [{ ...map.layout.spawn, zone: 0 }];
    map.layout.objects.forEach((item, index) => {
      const direction = index % 2 ? -1 : 1;
      if (item.type === 'checkpoint') checkpoints.push({ x: item.x, y: item.y, zone: 0 });
      else if (item.type === 'pillar') hazards.pillars.push({ x: item.x, y: item.y, r: 48 + difficulty * 3 });
      else if (item.type === 'bumper') hazards.bumpers.push({ x: item.x, y: item.y, r: 46 + difficulty * 2 });
      else if (item.type === 'rotor') hazards.rotors.push({ x: item.x, y: item.y, length: 300 + difficulty * 24, width: 24 + difficulty, speed: direction * (1.05 + difficulty * .2), angle: index * .7 });
      else if (item.type === 'shockwave') hazards.shockwaves.push({ x: item.x, y: item.y, period: Math.max(1.35, 2.8 - difficulty * .2), maxRadius: 360 + difficulty * 28, width: 17 + difficulty * 2, phase: index * .31 });
      else if (item.type === 'laser') hazards.lasers.push({ x1: item.x, y1: 250, x2: item.x, y2: 1350, period: Math.max(1.45, 2.8 - difficulty * .18), onFor: Math.max(.7, 1.5 - difficulty * .1), phase: index * .27 });
      else if (item.type === 'gate') hazards.gates.push({ x: item.x, y: 250, w: 44, h: 1100, period: Math.max(1.9, 3.55 - difficulty * .24), openFor: Math.max(.7, 1.45 - difficulty * .1), phase: index * .35 });
      else if (item.type === 'boost') hazards.boostPads.push({ x: item.x - 85, y: item.y - 105, w: 170, h: 210, dirX: 1, dirY: 0 });
      else if (item.type === 'hole') hazards.holes.push({ kind: 'circle', x: item.x, y: item.y, r: 76 + difficulty * 7 });
      else if (item.type === 'enemy') enemies.push({ x: item.x, y: item.y });
    });
    checkpoints.sort((a, b) => a.x - b.x).forEach((item, index) => { item.zone = Math.min(index, 4); });
    return {
      kind: 'custom', version: VERSION, map: copy(map), code: serialize(map),
      floors: copyList(map.layout.floors || []),
      checkpoints, exit: copy(map.layout.exit), hazards, enemies,
      rules: { enemySpeedMultiplier: Number((.9 + difficulty * .1).toFixed(2)), hazardSpeedMultiplier: Number((.92 + difficulty * .08).toFixed(2)) }
    };
  }

  const copyList = value => value.map(item => ({ ...item }));
  const validateMap = value => normalizedMap(value) !== null;
  const getStatus = () => ({ ...status, version: VERSION, mapCount: maps.length, maxMaps: MAX_MAPS, ...unlockProgress() });

  global.CustomMapStore = Object.freeze({
    VERSION, UNLOCK_CLEAR_COUNT, SAFE_ALPHABET, WORLD_BOUNDS, MAX_OBJECTS, MAX_FLOORS,
    getStatus, getUnlockProgress: unlockProgress, isUnlocked, recordFullClear,
    recordResult: result => result?.fullClear === true ? recordFullClear(result.runId) : { ...unlockProgress(), counted: false, newlyUnlocked: false },
    list, get, create, createDraft, registerVerified, update, remove, validateMap, validateLayout, serialize, deserialize, generate,
    getRating, addReview
  });
})(typeof window !== 'undefined' ? window : globalThis);
