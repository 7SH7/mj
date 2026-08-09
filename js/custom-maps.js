'use strict';

// SLIP OUT: custom maps layer
// Classic-script API. Load this file before the UI layer that consumes it.
(function exposeCustomMapStore(global) {
  const VERSION = 1;
  const UNLOCK_CLEAR_COUNT = 3;
  const MAX_MAPS = 40;
  const MAX_NAME_LENGTH = 30;
  const MAX_SEED = 0x7fff;
  const MAPS_KEY = 'slip-out-custom-maps-v1';
  const PROGRESS_KEY = 'slip-out-custom-progress-v1';
  const SAFE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

  const status = {
    storageMode: 'memory',
    lastStorageError: null
  };

  const copy = value => JSON.parse(JSON.stringify(value));
  const clampValue = (value, min, max) => Math.max(min, Math.min(max, value));

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
      status.storageMode = 'localStorage';
      status.lastStorageError = null;
      return raw === null ? copy(fallback) : JSON.parse(raw);
    } catch (error) {
      status.storageMode = 'memory';
      status.lastStorageError = String(error && error.message ? error.message : error);
      return copy(fallback);
    }
  }

  function storageWrite(key, value) {
    try {
      if (!global.localStorage) return false;
      global.localStorage.setItem(key, JSON.stringify(value));
      status.storageMode = 'localStorage';
      status.lastStorageError = null;
      return true;
    } catch (error) {
      status.storageMode = 'memory';
      status.lastStorageError = String(error && error.message ? error.message : error);
      return false;
    }
  }

  function normalizeProgress(value) {
    const fullClears = Number.isInteger(value && value.fullClears)
      ? clampValue(value.fullClears, 0, 999999)
      : 0;
    const clearedRuns = Array.isArray(value && value.clearedRuns)
      ? value.clearedRuns.filter(item => typeof item === 'string').slice(-100)
      : [];
    return { fullClears, clearedRuns };
  }

  function normalizeSeed(value) {
    if (typeof value === 'string' && value.trim() !== '') {
      const numeric = Number(value);
      value = Number.isFinite(numeric) ? numeric : hashText(value);
    }
    if (!Number.isFinite(value)) return null;
    return (Math.abs(Math.trunc(value)) >>> 0) % (MAX_SEED + 1);
  }

  function normalizedMap(value, options) {
    options = options || {};
    if (!value || typeof value !== 'object') return null;
    const name = typeof value.name === 'string' ? value.name.trim() : '';
    const seed = normalizeSeed(value.seed);
    const difficulty = Number(value.difficulty);
    const createdAt = typeof value.createdAt === 'string' && !Number.isNaN(Date.parse(value.createdAt))
      ? new Date(value.createdAt).toISOString()
      : null;
    const id = typeof value.id === 'string' ? value.id.trim() : '';
    if (!name || name.length > MAX_NAME_LENGTH || seed === null) return null;
    if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) return null;
    if (!createdAt || !/^[a-z0-9][a-z0-9_-]{3,63}$/i.test(id)) return null;
    const result = { id, name, seed, difficulty, createdAt };
    return options.freeze ? Object.freeze(result) : result;
  }

  function normalizeMaps(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    const result = [];
    value.forEach(item => {
      const map = normalizedMap(item);
      if (map && !seen.has(map.id) && result.length < MAX_MAPS) {
        seen.add(map.id);
        result.push(map);
      }
    });
    return result;
  }

  let progress = normalizeProgress(storageRead(PROGRESS_KEY, { fullClears: 0, clearedRuns: [] }));
  let maps = normalizeMaps(storageRead(MAPS_KEY, []));

  function persistMaps() {
    storageWrite(MAPS_KEY, maps);
  }

  function persistProgress() {
    storageWrite(PROGRESS_KEY, progress);
  }

  function isUnlocked() {
    return progress.fullClears >= UNLOCK_CLEAR_COUNT;
  }

  function unlockProgress() {
    return {
      fullClears: progress.fullClears,
      requiredClears: UNLOCK_CLEAR_COUNT,
      remainingClears: Math.max(0, UNLOCK_CLEAR_COUNT - progress.fullClears),
      unlocked: isUnlocked()
    };
  }

  function recordFullClear(runId) {
    const before = isUnlocked();
    const normalizedRunId = typeof runId === 'string' ? runId.trim().slice(0, 80) : '';
    if (normalizedRunId && progress.clearedRuns.includes(normalizedRunId)) {
      return { ...unlockProgress(), counted: false, newlyUnlocked: false };
    }
    progress.fullClears += 1;
    if (normalizedRunId) progress.clearedRuns.push(normalizedRunId);
    progress.clearedRuns = progress.clearedRuns.slice(-100);
    persistProgress();
    return { ...unlockProgress(), counted: true, newlyUnlocked: !before && isUnlocked() };
  }

  function recordResult(result) {
    if (!result || result.fullClear !== true) {
      return { ...unlockProgress(), counted: false, newlyUnlocked: false };
    }
    return recordFullClear(result.runId);
  }

  function requireUnlocked() {
    if (!isUnlocked()) {
      const error = new Error(`커스텀 맵은 전체 클리어 ${UNLOCK_CLEAR_COUNT}회 후 해금됩니다.`);
      error.code = 'CUSTOM_MAP_LOCKED';
      throw error;
    }
  }

  function makeId(name, seed, createdAt) {
    const suffix = hashText(`${name}|${seed}|${createdAt}`).toString(36).padStart(7, '0').slice(-7);
    let id = `cm_${Date.parse(createdAt).toString(36)}_${suffix}`;
    let counter = 1;
    while (maps.some(item => item.id === id)) id = `${id.slice(0, 58)}_${counter++}`;
    return id;
  }

  function list() {
    return maps.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(copy);
  }

  function get(id) {
    const found = maps.find(item => item.id === id);
    return found ? copy(found) : null;
  }

  function create(input) {
    requireUnlocked();
    if (maps.length >= MAX_MAPS) {
      const error = new Error(`커스텀 맵은 최대 ${MAX_MAPS}개까지 저장할 수 있습니다.`);
      error.code = 'CUSTOM_MAP_LIMIT';
      throw error;
    }
    input = input || {};
    const createdAt = new Date().toISOString();
    const suppliedSeed = normalizeSeed(input.seed);
    const seed = suppliedSeed === null
      ? hashText(`${input.name || ''}|${createdAt}|${maps.length}`) % (MAX_SEED + 1)
      : suppliedSeed;
    const candidate = {
      id: makeId(String(input.name || ''), seed, createdAt),
      name: String(input.name || '').trim(),
      seed,
      difficulty: Number(input.difficulty),
      createdAt
    };
    const map = normalizedMap(candidate);
    if (!map) {
      const error = new TypeError('맵 이름(1~30자), 시드, 난이도(1~5)를 확인해 주세요.');
      error.code = 'INVALID_CUSTOM_MAP';
      throw error;
    }
    maps.push(map);
    persistMaps();
    return copy(map);
  }

  function update(id, changes) {
    requireUnlocked();
    const index = maps.findIndex(item => item.id === id);
    if (index < 0) return null;
    changes = changes || {};
    const candidate = {
      ...maps[index],
      name: changes.name === undefined ? maps[index].name : String(changes.name).trim(),
      seed: changes.seed === undefined ? maps[index].seed : changes.seed,
      difficulty: changes.difficulty === undefined ? maps[index].difficulty : Number(changes.difficulty)
    };
    const map = normalizedMap(candidate);
    if (!map) {
      const error = new TypeError('맵 이름(1~30자), 시드, 난이도(1~5)를 확인해 주세요.');
      error.code = 'INVALID_CUSTOM_MAP';
      throw error;
    }
    maps[index] = map;
    persistMaps();
    return copy(map);
  }

  function remove(id) {
    requireUnlocked();
    const index = maps.findIndex(item => item.id === id);
    if (index < 0) return false;
    maps.splice(index, 1);
    persistMaps();
    return true;
  }

  function checksum(seed, difficulty) {
    return hashText(`${seed}:${difficulty}:SLIP`) & 3;
  }

  function serialize(mapOrId) {
    const map = typeof mapOrId === 'string' ? get(mapOrId) : normalizedMap(mapOrId);
    if (!map) {
      const error = new TypeError('공유할 수 없는 커스텀 맵입니다.');
      error.code = 'INVALID_CUSTOM_MAP';
      throw error;
    }
    let packed = ((map.difficulty - 1) << 17) | (checksum(map.seed, map.difficulty) << 15) | map.seed;
    let code = '';
    for (let index = 0; index < 4; index++) {
      code = SAFE_ALPHABET[packed & 31] + code;
      packed >>>= 5;
    }
    return code;
  }

  function deserialize(code) {
    const normalizedCode = typeof code === 'string' ? code.trim().toUpperCase() : '';
    if (normalizedCode.length !== 4) return null;
    let packed = 0;
    for (const character of normalizedCode) {
      const value = SAFE_ALPHABET.indexOf(character);
      if (value < 0) return null;
      packed = (packed << 5) | value;
    }
    const difficulty = ((packed >>> 17) & 7) + 1;
    const storedChecksum = (packed >>> 15) & 3;
    const seed = packed & MAX_SEED;
    if (difficulty > 5 || storedChecksum !== checksum(seed, difficulty)) return null;
    return {
      id: `shared_${normalizedCode.toLowerCase()}`,
      name: `공유 맵 ${normalizedCode}`,
      seed,
      difficulty,
      createdAt: new Date(0).toISOString()
    };
  }

  function importCode(code, name) {
    requireUnlocked();
    const decoded = deserialize(code);
    if (!decoded) {
      const error = new TypeError('유효하지 않은 4자리 맵 코드입니다.');
      error.code = 'INVALID_MAP_CODE';
      throw error;
    }
    const existing = maps.find(item => serialize(item) === code.trim().toUpperCase());
    if (existing) return copy(existing);
    return create({ name: name || decoded.name, seed: decoded.seed, difficulty: decoded.difficulty });
  }

  function makeRandom(seed) {
    let value = seed >>> 0;
    return function random() {
      value += 0x6d2b79f5;
      let result = value;
      result = Math.imul(result ^ (result >>> 15), result | 1);
      result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
      return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
    };
  }

  function generate(mapOrCode) {
    const map = typeof mapOrCode === 'string'
      ? (mapOrCode.length === 4 ? deserialize(mapOrCode) : get(mapOrCode))
      : normalizedMap(mapOrCode);
    if (!map) {
      const error = new TypeError('생성할 수 없는 커스텀 맵입니다.');
      error.code = 'INVALID_CUSTOM_MAP';
      throw error;
    }

    const random = makeRandom((map.seed | (map.difficulty << 20)) >>> 0);
    const difficulty = map.difficulty;
    const xAt = (index, count) => 1050 + index * (7000 / Math.max(1, count - 1)) + Math.round((random() - .5) * 180);
    const yAt = () => Math.round(390 + random() * 820);
    const direction = () => random() < .5 ? -1 : 1;
    const makeMany = (count, factory) => Array.from({ length: count }, (_, index) => factory(index, count));

    const winds = makeMany(Math.max(0, difficulty - 1), (index, count) => ({
      x: xAt(index, count), y: 260, w: 420 + Math.round(random() * 280), h: 1080,
      dirX: direction() * (.15 + random() * .85), dirY: direction() * random(),
      strength: 190 + difficulty * 34 + Math.round(random() * 70)
    }));
    const shockwaves = makeMany(Math.max(0, difficulty - 2), (index, count) => ({
      x: xAt(index, count), y: yAt(), period: Math.max(1.35, 3.05 - difficulty * .2 - random() * .35),
      maxRadius: 370 + Math.round(random() * 170), width: 17 + difficulty * 2, phase: random() * 2
    }));
    const lasers = makeMany(Math.max(0, difficulty - 2) + (difficulty === 5 ? 2 : 0), (index, count) => {
      const x = xAt(index, count);
      const diagonal = random() > .62;
      return {
        x1: x, y1: 220, x2: diagonal ? x + direction() * (380 + random() * 260) : x,
        y2: 1380, period: Math.max(1.45, 2.85 - difficulty * .18),
        onFor: Math.max(.7, 1.5 - difficulty * .1), phase: random() * 1.8
      };
    });
    const bumpers = makeMany(2 + difficulty * 2, (index, count) => ({
      x: xAt(index, count), y: yAt(), r: 42 + Math.round(random() * 17)
    }));
    const rotors = makeMany(1 + Math.floor(difficulty / 2), (index, count) => ({
      x: xAt(index, count), y: yAt(), length: 300 + Math.round(random() * 160),
      width: 23 + difficulty, speed: direction() * (1.1 + difficulty * .22 + random() * .4), angle: random() * Math.PI
    }));
    const movers = makeMany(Math.floor(difficulty / 2), (index, count) => {
      const x = xAt(index, count);
      const y = yAt();
      return {
        baseX: x, baseY: y, x, y, w: 90 + Math.round(random() * 35), h: 210 + Math.round(random() * 90),
        axis: random() < .7 ? 'y' : 'x', amp: 220 + Math.round(random() * 160),
        speed: 1.15 + difficulty * .18 + random() * .3, phase: random() * 2.5
      };
    });
    const gates = makeMany(Math.max(0, difficulty - 2), (index, count) => ({
      x: xAt(index, count), y: 280, w: 44, h: 1040,
      period: Math.max(1.9, 3.6 - difficulty * .25), openFor: Math.max(.65, 1.45 - difficulty * .12), phase: random() * 2
    }));
    const launchers = makeMany(Math.max(0, difficulty - 1), (index, count) => ({
      x: xAt(index, count), y: random() < .5 ? 260 : 1340,
      dirX: 0, dirY: random() < .5 ? 1 : -1,
      period: Math.max(.85, 1.95 - difficulty * .15 - random() * .2), last: 0
    }));
    const pillars = makeMany(2 + difficulty, (index, count) => ({
      x: xAt(index, count), y: yAt(), r: 42 + Math.round(random() * 22)
    }));
    const collapse = difficulty < 3 ? [] : makeMany((difficulty - 2) * 4, (index) => ({
      x: 5900 + (index % 4) * 185, y: 470 + Math.floor(index / 4) * 180,
      w: 160, h: 150, state: 'idle', timer: 0, seed: map.seed + index
    }));
    const boostPads = makeMany(1 + Math.floor(difficulty / 3), (index, count) => ({
      x: xAt(index, count), y: yAt() - 100, w: 170, h: 230, dirX: 1, dirY: (random() - .5) * .45
    }));
    const slowPads = makeMany(Math.floor((difficulty + 1) / 2), (index, count) => ({
      x: xAt(index, count), y: yAt() - 100, w: 170, h: 240
    }));
    const enemies = makeMany(1 + difficulty, (index, count) => ({ x: xAt(index, count), y: yAt() }));

    return {
      kind: 'custom',
      version: VERSION,
      map: copy(map),
      code: serialize(map),
      layout: {
        floorPresetIndex: map.seed % 5,
        holePresetIndex: (map.seed >>> 3) % 5,
        mirrorY: Boolean((map.seed >>> 6) & 1),
        holeScale: Number((.88 + difficulty * .035 + random() * .08).toFixed(3)),
        laneOffset: Math.round((random() - .5) * 90),
        collapseRateMultiplier: Number((1 + difficulty * .08).toFixed(2))
      },
      hazards: {
        winds, shockwaves, lasers, bumpers, rotors, movers, gates, launchers,
        pillars, collapse, boostPads, slowPads
      },
      enemies,
      rules: {
        enemySpeedMultiplier: Number((.9 + difficulty * .1).toFixed(2)),
        hazardSpeedMultiplier: Number((.92 + difficulty * .08).toFixed(2))
      }
    };
  }

  function validateMap(value) {
    return normalizedMap(value) !== null;
  }

  function getStatus() {
    return {
      ...status,
      version: VERSION,
      mapCount: maps.length,
      maxMaps: MAX_MAPS,
      ...unlockProgress()
    };
  }

  global.CustomMapStore = Object.freeze({
    VERSION,
    UNLOCK_CLEAR_COUNT,
    SAFE_ALPHABET,
    getStatus,
    getUnlockProgress: unlockProgress,
    isUnlocked,
    recordFullClear,
    recordResult,
    list,
    get,
    create,
    update,
    remove,
    validateMap,
    serialize,
    deserialize,
    importCode,
    generate
  });
})(typeof window !== 'undefined' ? window : globalThis);
