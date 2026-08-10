'use strict';

// SLIP OUT: courses layer
const BASE_FLOORS = [
    { x: 80, y: 300, w: 820, h: 1000, type: 'safe', zone: 0 },
    { x: 820, y: 235, w: 1440, h: 1130, type: 'ice', zone: 0 },
    { x: 2170, y: 445, w: 390, h: 710, type: 'safe', zone: 0 },
    { x: 2480, y: 275, w: 1470, h: 1050, type: 'ice', zone: 1 },
    { x: 3890, y: 420, w: 390, h: 760, type: 'safe', zone: 1 },
    { x: 4200, y: 500, w: 310, h: 600, type: 'ice', zone: 2 },
    { x: 4400, y: 155, w: 950, h: 570, type: 'ice', zone: 2 },
    { x: 4400, y: 875, w: 950, h: 570, type: 'ice', zone: 2 },
    { x: 5250, y: 500, w: 330, h: 600, type: 'ice', zone: 2 },
    { x: 5480, y: 385, w: 330, h: 830, type: 'safe', zone: 2 },
    { x: 5750, y: 575, w: 670, h: 450, type: 'ice', zone: 3 },
    { x: 6270, y: 330, w: 460, h: 695, type: 'ice', zone: 3 },
    { x: 6580, y: 330, w: 500, h: 450, type: 'black', zone: 3 },
    { x: 6990, y: 280, w: 340, h: 680, type: 'safe', zone: 3 },
    { x: 7270, y: 130, w: 1260, h: 1340, type: 'ice', zone: 4 },
  ];
  const BASE_HOLES = [
    { kind: 'circle', x: 1210, y: 920, r: 100 }, { kind: 'circle', x: 1590, y: 500, r: 82 },
    { kind: 'circle', x: 1910, y: 980, r: 115 }, { kind: 'rect', x: 2860, y: 275, w: 170, h: 250 },
    { kind: 'rect', x: 3290, y: 1075, w: 210, h: 250 },
    { kind: 'circle', x: 7700, y: 370, r: 110 }, { kind: 'circle', x: 7930, y: 1210, r: 100 }
  ];
  const BASE_BOOST_PADS = [
    { x: 5880, y: 665, w: 180, h: 270, dirX: 1, dirY: 0 },
    { x: 6140, y: 665, w: 170, h: 270, dirX: 1, dirY: -.1 },
    { x: 6410, y: 520, w: 190, h: 210, dirX: .72, dirY: -.68 }
  ];
  const BASE_SLOW_PADS = [{ x: 6820, y: 430, w: 180, h: 250 }];
  const BASE_CHECKPOINTS = [
    { x: 430, y: 800, zone: 0 }, { x: 2350, y: 800, zone: 1 },
    { x: 4070, y: 800, zone: 2 }, { x: 5630, y: 800, zone: 3 }, { x: 7150, y: 620, zone: 4 }
  ];
  const BASE_PILLARS = [
    { x: 1120, y: 500, r: 58 }, { x: 1430, y: 1120, r: 67 }, { x: 1770, y: 740, r: 58 },
    { x: 2090, y: 410, r: 46 }, { x: 2640, y: 480, r: 50 }, { x: 3680, y: 1110, r: 50 },
    { x: 4680, y: 430, r: 54 }, { x: 4890, y: 1170, r: 54 }, { x: 7500, y: 760, r: 62 },
    { x: 8050, y: 680, r: 52 }
  ];
  const BASE_ROTORS = [
    { x: 2850, y: 800, length: 390, width: 26, speed: 1.15, angle: .2 },
    { x: 3520, y: 720, length: 440, width: 28, speed: -1.42, angle: 1.1 },
    { x: 4720, y: 1140, length: 300, width: 24, speed: 1.25, angle: .4 },
    { x: 7830, y: 770, length: 390, width: 30, speed: -1.65, angle: .8 }
  ];
  const BASE_MOVERS = [
    { baseX: 3170, baseY: 420, x: 3170, y: 420, w: 95, h: 270, axis: 'y', amp: 390, speed: 1.2, phase: 0 },
    { baseX: 3730, baseY: 560, x: 3730, y: 560, w: 85, h: 300, axis: 'y', amp: 260, speed: 1.55, phase: 2.2 },
    { baseX: 5020, baseY: 220, x: 5020, y: 220, w: 150, h: 105, axis: 'x', amp: 130, speed: 1.3, phase: .8 },
    { baseX: 5030, baseY: 1270, x: 5030, y: 1270, w: 150, h: 105, axis: 'x', amp: 140, speed: 1.45, phase: 2.4 },
    { baseX: 8110, baseY: 1000, x: 8110, y: 1000, w: 125, h: 200, axis: 'y', amp: 310, speed: 1.3, phase: 1.1 }
  ];
  const BASE_GATES = [
    { x: 3830, y: 275, w: 48, h: 1050, period: 3.8, openFor: 1.55, phase: .3 },
    { x: 5280, y: 155, w: 46, h: 570, period: 3.2, openFor: 1.3, phase: 1.7 },
    { x: 5280, y: 875, w: 46, h: 570, period: 3.2, openFor: 1.3, phase: .1 }
  ];
  const BASE_LAUNCHERS = [
    { x: 4350, y: 280, dirX: 0, dirY: 1, period: 1.8, last: 0 },
    { x: 5150, y: 760, dirX: -1, dirY: 0, period: 2.1, last: 0 },
    { x: 7420, y: 150, dirX: 0, dirY: 1, period: 1.55, last: 0 },
    { x: 8260, y: 1450, dirX: 0, dirY: -1, period: 1.7, last: 0 }
  ];
  const BASE_COLLAPSE_TILES = [];
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 3; row++) {
      BASE_COLLAPSE_TILES.push({ x: 7350 + col * 235, y: 520 + row * 225, w: 200, h: 190, state: 'idle', timer: 0, seed: col * 3 + row });
    }
  }
  const BASE_EXIT = { x: 8370, y: 800, r: 128 };

  const COURSE_PRESETS = [
    {
      name: '빙하 관문', short: '빙하', difficulty: 1, accent: '#54f5ff',
      background: ['#0d1d2c', '#070d18', '#03060c', '#23425a'],
      description: '관성과 구조의 기본을 익히는 빙하 관문',
      brief: '빙판, 회전봉, 분기로, 과속 구간, 붕괴 지대',
      zoneNames: BASE_ZONE_NAMES, objectives: BASE_ZONE_OBJECTIVES,
      enemies: [{ x: 4790, y: 410 }, { x: 5120, y: 1190 }, { x: 7680, y: 1060 }]
    },
    {
      name: '풍동 회랑', short: '풍동', difficulty: 2, accent: '#7be8a5',
      background: ['#102b2b', '#071716', '#030a0b', '#24554d'],
      description: '밀고 당기는 풍동과 튕겨내는 범퍼가 등장합니다',
      brief: '양방향 풍동, 탄성 범퍼, 이중 통로, 고속 회전봉',
      zoneNames: ['순풍 활주', '쌍갈래 기류', '역풍 회랑', '범퍼 필드', '태풍의 눈'],
      objectives: ['순풍을 타고 첫 관문을 통과하세요', '위아래 풍로 중 안전한 길을 선택하세요', '역풍에 맞서 안전 구역에 도달하세요', '범퍼의 반동을 진행 방향으로 이용하세요', '교차 기류를 뚫고 탈출 장치에 진입하세요'],
      enemies: [{ x: 4520, y: 520 }, { x: 5050, y: 1080 }, { x: 6200, y: 430 }, { x: 7850, y: 1120 }]
    },
    {
      name: '펄스 공장', short: '펄스', difficulty: 3, accent: '#ffd45c',
      background: ['#302812', '#171207', '#090703', '#695223'],
      description: '주기적으로 퍼지는 충격파와 포탄 세례를 돌파하세요',
      brief: '충격파 발생기, 연속 포대, 압축 게이트, 붕괴 발판',
      zoneNames: ['점화 라인', '압축 프레스', '공명 챔버', '탄막 조립로', '과부하 코어'],
      objectives: ['발생기의 파동 주기를 먼저 읽으세요', '프레스 사이의 빈틈을 타고 통과하세요', '점프로 충격파 고리를 넘어가세요', '포탄의 궤적 반대편으로 미끄러지세요', '과부하 구간을 멈추지 말고 탈출하세요'],
      enemies: [{ x: 4450, y: 420 }, { x: 4930, y: 1180 }, { x: 5900, y: 760 }, { x: 6700, y: 520 }, { x: 7900, y: 1030 }]
    },
    {
      name: '레이저 격납고', short: '레이저', difficulty: 4, accent: '#bc78ff',
      background: ['#21162f', '#10091b', '#06040c', '#4c2a68'],
      description: '점멸 레이저와 교차 풍동이 길을 계속 바꿉니다',
      brief: '점멸 레이저, 교차 풍동, 추적 드론, 초고속 게이트',
      zoneNames: ['보안 스캔', '레이저 격자', '교차 풍동', '드론 격납고', '봉쇄 해제'],
      objectives: ['점멸 신호를 보고 첫 레이저를 넘으세요', '꺼지는 순서에 맞춰 격자를 통과하세요', '옆바람에 밀리기 전에 방향을 보정하세요', '드론을 기둥 쪽으로 유인해 따돌리세요', '최종 봉쇄선이 열릴 때 전력 질주하세요'],
      enemies: [{ x: 2800, y: 430 }, { x: 3650, y: 1130 }, { x: 4550, y: 430 }, { x: 5150, y: 1140 }, { x: 6550, y: 590 }, { x: 7900, y: 1080 }]
    },
    {
      name: '코어 붕괴', short: '붕괴', difficulty: 5, accent: '#ff4d78',
      background: ['#32121d', '#17070d', '#080305', '#6d2438'],
      description: '모든 장애물이 최고 밀도로 겹치는 최종 코스입니다',
      brief: '레이저, 충격파, 풍동, 범퍼, 탄막, 붕괴의 종합 구간',
      zoneNames: ['균열 진입', '다중 압착', '폭주 공명', '재난 회랑', '코어 붕괴'],
      objectives: ['좁아진 빙판에서 첫 균열을 피하세요', '회전봉과 게이트를 한 번에 읽으세요', '충격파와 레이저를 점프로 연계 회피하세요', '풍동과 탄막 사이의 안전선을 찾으세요', '붕괴하는 코어 위를 끝까지 질주하세요'],
      enemies: [{ x: 1550, y: 520 }, { x: 2900, y: 1120 }, { x: 3650, y: 470 }, { x: 4550, y: 1120 }, { x: 5200, y: 440 }, { x: 6200, y: 980 }, { x: 6840, y: 500 }, { x: 7950, y: 1110 }]
    }
  ];

  const COURSE_FLOORS = [
    BASE_FLOORS,
    [
      { x: 80, y: 300, w: 850, h: 1000, type: 'safe', zone: 0 }, { x: 820, y: 220, w: 1450, h: 1160, type: 'ice', zone: 0 },
      { x: 2170, y: 470, w: 410, h: 660, type: 'safe', zone: 0 }, { x: 2480, y: 150, w: 920, h: 580, type: 'ice', zone: 1 },
      { x: 2480, y: 870, w: 920, h: 580, type: 'ice', zone: 1 }, { x: 3300, y: 300, w: 660, h: 1000, type: 'black', zone: 1 },
      { x: 3890, y: 420, w: 390, h: 760, type: 'safe', zone: 1 }, { x: 4200, y: 250, w: 1150, h: 1100, type: 'ice', zone: 2 },
      { x: 5250, y: 450, w: 560, h: 700, type: 'safe', zone: 2 }, { x: 5750, y: 160, w: 920, h: 620, type: 'ice', zone: 3 },
      { x: 5750, y: 820, w: 920, h: 620, type: 'ice', zone: 3 }, { x: 6500, y: 330, w: 650, h: 940, type: 'black', zone: 3 },
      { x: 6990, y: 280, w: 380, h: 820, type: 'safe', zone: 3 }, { x: 7270, y: 140, w: 1260, h: 1320, type: 'ice', zone: 4 }
    ],
    [
      { x: 80, y: 340, w: 850, h: 920, type: 'safe', zone: 0 }, { x: 820, y: 270, w: 1450, h: 1060, type: 'ice', zone: 0 },
      { x: 2170, y: 450, w: 420, h: 700, type: 'safe', zone: 0 }, { x: 2480, y: 250, w: 1480, h: 1100, type: 'black', zone: 1 },
      { x: 3890, y: 420, w: 390, h: 760, type: 'safe', zone: 1 }, { x: 4200, y: 150, w: 760, h: 630, type: 'ice', zone: 2 },
      { x: 4200, y: 820, w: 760, h: 630, type: 'ice', zone: 2 }, { x: 4880, y: 300, w: 480, h: 1000, type: 'ice', zone: 2 },
      { x: 5250, y: 450, w: 560, h: 700, type: 'safe', zone: 2 }, { x: 5750, y: 300, w: 1400, h: 1000, type: 'ice', zone: 3 },
      { x: 6990, y: 280, w: 380, h: 820, type: 'safe', zone: 3 }, { x: 7270, y: 130, w: 1260, h: 1340, type: 'black', zone: 4 }
    ],
    [
      { x: 80, y: 300, w: 850, h: 1000, type: 'safe', zone: 0 }, { x: 820, y: 190, w: 1450, h: 1220, type: 'ice', zone: 0 },
      { x: 2170, y: 460, w: 420, h: 680, type: 'safe', zone: 0 }, { x: 2480, y: 180, w: 720, h: 550, type: 'ice', zone: 1 },
      { x: 2480, y: 870, w: 720, h: 550, type: 'ice', zone: 1 }, { x: 3120, y: 260, w: 840, h: 1080, type: 'ice', zone: 1 },
      { x: 3890, y: 420, w: 390, h: 760, type: 'safe', zone: 1 }, { x: 4200, y: 240, w: 1150, h: 1120, type: 'black', zone: 2 },
      { x: 5250, y: 440, w: 570, h: 720, type: 'safe', zone: 2 }, { x: 5750, y: 180, w: 680, h: 650, type: 'ice', zone: 3 },
      { x: 6200, y: 770, w: 950, h: 650, type: 'ice', zone: 3 }, { x: 6990, y: 280, w: 380, h: 820, type: 'safe', zone: 3 },
      { x: 7270, y: 130, w: 1260, h: 1340, type: 'ice', zone: 4 }
    ],
    [
      { x: 80, y: 390, w: 850, h: 820, type: 'safe', zone: 0 }, { x: 820, y: 280, w: 1450, h: 1040, type: 'black', zone: 0 },
      { x: 2170, y: 470, w: 420, h: 660, type: 'safe', zone: 0 }, { x: 2480, y: 260, w: 1480, h: 1080, type: 'ice', zone: 1 },
      { x: 3890, y: 440, w: 390, h: 720, type: 'safe', zone: 1 }, { x: 4200, y: 170, w: 720, h: 570, type: 'ice', zone: 2 },
      { x: 4200, y: 860, w: 720, h: 570, type: 'ice', zone: 2 }, { x: 4820, y: 300, w: 540, h: 1000, type: 'black', zone: 2 },
      { x: 5250, y: 460, w: 570, h: 680, type: 'safe', zone: 2 }, { x: 5750, y: 350, w: 1400, h: 900, type: 'black', zone: 3 },
      { x: 6990, y: 300, w: 380, h: 800, type: 'safe', zone: 3 }, { x: 7270, y: 150, w: 1260, h: 1300, type: 'black', zone: 4 }
    ]
  ];

  const COURSE_HOLES = [
    BASE_HOLES,
    [{ kind: 'circle', x: 1320, y: 510, r: 92 }, { kind: 'circle', x: 1830, y: 1080, r: 105 }, { kind: 'rect', x: 2860, y: 600, w: 220, h: 400 }, { kind: 'circle', x: 4620, y: 800, r: 120 }, { kind: 'circle', x: 6120, y: 500, r: 95 }, { kind: 'circle', x: 7850, y: 390, r: 112 }],
    [{ kind: 'circle', x: 1150, y: 840, r: 85 }, { kind: 'circle', x: 1690, y: 480, r: 110 }, { kind: 'rect', x: 3020, y: 590, w: 190, h: 420 }, { kind: 'circle', x: 4510, y: 470, r: 90 }, { kind: 'circle', x: 5100, y: 1080, r: 105 }, { kind: 'circle', x: 6500, y: 840, r: 130 }, { kind: 'circle', x: 8050, y: 520, r: 105 }],
    [{ kind: 'circle', x: 1200, y: 500, r: 105 }, { kind: 'circle', x: 1760, y: 1080, r: 115 }, { kind: 'rect', x: 2760, y: 520, w: 180, h: 560 }, { kind: 'circle', x: 3440, y: 830, r: 105 }, { kind: 'circle', x: 4700, y: 800, r: 125 }, { kind: 'circle', x: 6050, y: 540, r: 95 }, { kind: 'circle', x: 6700, y: 1070, r: 100 }, { kind: 'circle', x: 7900, y: 1120, r: 115 }],
    [{ kind: 'circle', x: 1110, y: 800, r: 90 }, { kind: 'circle', x: 1570, y: 480, r: 110 }, { kind: 'circle', x: 1940, y: 1100, r: 115 }, { kind: 'rect', x: 2820, y: 260, w: 180, h: 350 }, { kind: 'rect', x: 3320, y: 990, w: 210, h: 350 }, { kind: 'circle', x: 4540, y: 460, r: 105 }, { kind: 'circle', x: 5100, y: 1110, r: 105 }, { kind: 'circle', x: 6100, y: 790, r: 125 }, { kind: 'circle', x: 6730, y: 470, r: 105 }, { kind: 'circle', x: 7600, y: 420, r: 110 }, { kind: 'circle', x: 8100, y: 1170, r: 110 }]
  ];

  const makeTiles = (x, y, cols, rows, w = 160, h = 150, gapX = 180, gapY = 170) => {
    const tiles = [];
    for (let col = 0; col < cols; col++) for (let row = 0; row < rows; row++) tiles.push({ x: x + col * gapX, y: y + row * gapY, w, h, state: 'idle', timer: 0, seed: col * rows + row });
    return tiles;
  };

  const COURSE_HAZARDS = [
    { winds: [], shockwaves: [], lasers: [], bumpers: [], rotors: [], movers: [], gates: [], launchers: [], pillars: [], collapse: [], boostPads: [], slowPads: [] },
    {
      winds: [{ x: 980, y: 300, w: 620, h: 1000, dirX: .2, dirY: -1, strength: 220 }, { x: 2700, y: 180, w: 580, h: 1240, dirX: 1, dirY: 0, strength: 250 }, { x: 4420, y: 300, w: 680, h: 1000, dirX: -.25, dirY: 1, strength: 260 }, { x: 5850, y: 220, w: 650, h: 1160, dirX: 1, dirY: 0, strength: 290 }, { x: 7440, y: 220, w: 700, h: 1160, dirX: .15, dirY: -1, strength: 310 }],
      shockwaves: [], lasers: [],
      bumpers: [{ x: 1500, y: 790, r: 47 }, { x: 3060, y: 470, r: 48 }, { x: 3650, y: 1040, r: 52 }, { x: 4700, y: 530, r: 48 }, { x: 6180, y: 1050, r: 53 }, { x: 7900, y: 830, r: 56 }],
      rotors: [{ x: 3380, y: 800, length: 340, width: 25, speed: -1.8, angle: .5 }, { x: 6650, y: 790, length: 410, width: 27, speed: 1.9, angle: 1.1 }],
      movers: [], gates: [], launchers: [], pillars: [], collapse: [],
      boostPads: [{ x: 1980, y: 650, w: 180, h: 260, dirX: 1, dirY: 0 }], slowPads: [{ x: 6840, y: 500, w: 170, h: 250 }]
    },
    {
      winds: [],
      shockwaves: [{ x: 1450, y: 800, period: 2.8, maxRadius: 410, width: 18, phase: 0 }, { x: 3000, y: 800, period: 2.5, maxRadius: 520, width: 20, phase: .8 }, { x: 4720, y: 800, period: 2.25, maxRadius: 510, width: 22, phase: 1.3 }, { x: 6300, y: 800, period: 2.05, maxRadius: 540, width: 23, phase: .4 }, { x: 7900, y: 800, period: 1.85, maxRadius: 560, width: 24, phase: 1.1 }],
      lasers: [], bumpers: [{ x: 3500, y: 530, r: 48 }, { x: 3500, y: 1070, r: 48 }, { x: 6050, y: 520, r: 52 }, { x: 6800, y: 1090, r: 52 }],
      rotors: [{ x: 2700, y: 800, length: 360, width: 27, speed: 1.9, angle: .1 }, { x: 6150, y: 800, length: 440, width: 28, speed: -2.05, angle: .8 }],
      movers: [{ baseX: 2800, baseY: 340, x: 2800, y: 340, w: 100, h: 270, axis: 'y', amp: 330, speed: 1.8, phase: 1.1 }],
      gates: [{ x: 6760, y: 300, w: 44, h: 1000, period: 2.8, openFor: 1.05, phase: .6 }],
      launchers: [{ x: 5900, y: 320, dirX: 0, dirY: 1, period: 1.35, last: 0 }, { x: 6900, y: 1280, dirX: 0, dirY: -1, period: 1.25, last: 0 }],
      pillars: [], collapse: makeTiles(6000, 530, 3, 2), boostPads: [], slowPads: [{ x: 3730, y: 640, w: 160, h: 300 }]
    },
    {
      winds: [{ x: 1100, y: 260, w: 620, h: 1080, dirX: 0, dirY: 1, strength: 270 }, { x: 4300, y: 260, w: 850, h: 1080, dirX: -.35, dirY: -1, strength: 300 }, { x: 6000, y: 260, w: 800, h: 1080, dirX: .2, dirY: 1, strength: 330 }],
      shockwaves: [{ x: 5250, y: 800, period: 2.15, maxRadius: 470, width: 20, phase: .4 }],
      lasers: [{ x1: 2850, y1: 220, x2: 2850, y2: 1380, period: 2.6, onFor: 1.45, phase: 0 }, { x1: 3350, y1: 260, x2: 3350, y2: 1340, period: 2.4, onFor: 1.3, phase: .8 }, { x1: 4550, y1: 250, x2: 5150, y2: 1180, period: 2.2, onFor: 1.2, phase: .3 }, { x1: 5900, y1: 360, x2: 7000, y2: 1040, period: 2, onFor: 1.08, phase: 1.1 }, { x1: 7600, y1: 180, x2: 7600, y2: 1420, period: 1.8, onFor: .95, phase: .5 }, { x1: 8100, y1: 180, x2: 8100, y2: 1420, period: 1.7, onFor: .88, phase: 1.2 }],
      bumpers: [{ x: 1500, y: 520, r: 50 }, { x: 1850, y: 1080, r: 50 }, { x: 6400, y: 520, r: 54 }, { x: 6800, y: 1080, r: 54 }],
      rotors: [{ x: 3650, y: 800, length: 420, width: 28, speed: 2.15, angle: .2 }, { x: 6850, y: 800, length: 450, width: 29, speed: -2.25, angle: .9 }],
      movers: [], gates: [{ x: 7000, y: 280, w: 44, h: 900, period: 2.45, openFor: .9, phase: .2 }],
      launchers: [{ x: 6200, y: 370, dirX: 0, dirY: 1, period: 1.2, last: 0 }], pillars: [], collapse: makeTiles(7600, 500, 3, 2), boostPads: [], slowPads: []
    },
    {
      winds: [{ x: 1000, y: 320, w: 650, h: 960, dirX: .15, dirY: -1, strength: 320 }, { x: 2700, y: 280, w: 800, h: 1040, dirX: 0, dirY: 1, strength: 350 }, { x: 4400, y: 250, w: 800, h: 1100, dirX: -.4, dirY: -1, strength: 370 }, { x: 5900, y: 350, w: 1000, h: 900, dirX: .25, dirY: 1, strength: 390 }],
      shockwaves: [{ x: 1450, y: 800, period: 2.2, maxRadius: 430, width: 22, phase: 0 }, { x: 3300, y: 800, period: 1.95, maxRadius: 510, width: 24, phase: .7 }, { x: 4900, y: 800, period: 1.75, maxRadius: 500, width: 25, phase: 1.1 }, { x: 6500, y: 800, period: 1.6, maxRadius: 540, width: 26, phase: .3 }, { x: 8000, y: 800, period: 1.45, maxRadius: 570, width: 27, phase: .9 }],
      lasers: [{ x1: 2600, y1: 260, x2: 2600, y2: 1340, period: 2.1, onFor: 1.15, phase: 0 }, { x1: 3050, y1: 260, x2: 3700, y2: 1320, period: 1.95, onFor: 1.05, phase: .6 }, { x1: 4450, y1: 220, x2: 5100, y2: 1380, period: 1.8, onFor: .95, phase: 1.2 }, { x1: 5850, y1: 350, x2: 7000, y2: 1050, period: 1.65, onFor: .88, phase: .4 }, { x1: 7500, y1: 180, x2: 7500, y2: 1420, period: 1.5, onFor: .8, phase: 1 }, { x1: 7900, y1: 180, x2: 8350, y2: 1380, period: 1.4, onFor: .72, phase: .2 }],
      bumpers: [{ x: 1250, y: 520, r: 50 }, { x: 1750, y: 1080, r: 52 }, { x: 2900, y: 520, r: 52 }, { x: 3600, y: 1080, r: 54 }, { x: 4600, y: 520, r: 54 }, { x: 5150, y: 1080, r: 55 }, { x: 6100, y: 520, r: 56 }, { x: 6800, y: 1080, r: 57 }, { x: 7800, y: 800, r: 60 }],
      rotors: [{ x: 2600, y: 800, length: 390, width: 28, speed: 2.2, angle: .2 }, { x: 3300, y: 800, length: 440, width: 29, speed: -2.35, angle: .8 }, { x: 4600, y: 800, length: 410, width: 30, speed: 2.45, angle: 1.2 }, { x: 6500, y: 800, length: 470, width: 31, speed: -2.55, angle: .4 }],
      movers: [{ baseX: 3000, baseY: 360, x: 3000, y: 360, w: 105, h: 280, axis: 'y', amp: 350, speed: 2.1, phase: .3 }, { baseX: 6150, baseY: 700, x: 6150, y: 700, w: 120, h: 240, axis: 'y', amp: 360, speed: 2.3, phase: 1.4 }],
      gates: [{ x: 3720, y: 270, w: 46, h: 1060, period: 2.35, openFor: .82, phase: .4 }, { x: 6800, y: 340, w: 45, h: 920, period: 2.05, openFor: .7, phase: 1.1 }],
      launchers: [{ x: 4300, y: 290, dirX: 0, dirY: 1, period: 1.05, last: 0 }, { x: 5500, y: 1270, dirX: 0, dirY: -1, period: .95, last: 0 }, { x: 7200, y: 310, dirX: 0, dirY: 1, period: .86, last: 0 }],
      pillars: [], collapse: makeTiles(5900, 470, 4, 3, 155, 150, 175, 170), boostPads: [], slowPads: [{ x: 7000, y: 480, w: 170, h: 260 }]
    }
  ];

  const copyList = list => list.map(item => ({ ...item }));
  let floors = [], holes = [], boostPads = [], slowPads = [], checkpoints = [];
  let pillars = [], rotors = [], movers = [], gates = [], launchers = [], collapseTiles = [];
  let winds = [], shockwaves = [], lasers = [], bumpers = [];
  let exit = { ...BASE_EXIT };
  let currentCourse = COURSE_PRESETS[0];
  let selectedCustomMap = null;

  function configureCourse(index) {
    selectedCustomMap = null;
    selectedMap = clamp(Number(index) || 0, 0, COURSE_PRESETS.length - 1);
    currentCourse = COURSE_PRESETS[selectedMap];
    const extras = COURSE_HAZARDS[selectedMap];
    floors = copyList(COURSE_FLOORS[selectedMap]);
    holes = copyList(COURSE_HOLES[selectedMap]);
    checkpoints = copyList(BASE_CHECKPOINTS);
    boostPads = copyList([...BASE_BOOST_PADS, ...extras.boostPads]);
    slowPads = copyList([...BASE_SLOW_PADS, ...extras.slowPads]);
    pillars = copyList([...BASE_PILLARS, ...extras.pillars]);
    rotors = copyList([...BASE_ROTORS, ...extras.rotors]);
    movers = copyList([...BASE_MOVERS, ...extras.movers]);
    gates = copyList([...BASE_GATES, ...extras.gates]);
    launchers = copyList([...BASE_LAUNCHERS, ...extras.launchers]);
    collapseTiles = copyList([...BASE_COLLAPSE_TILES, ...extras.collapse]);
    winds = copyList(extras.winds); shockwaves = copyList(extras.shockwaves);
    lasers = copyList(extras.lasers); bumpers = copyList(extras.bumpers);
    exit = { ...BASE_EXIT };
    document.documentElement.style.setProperty('--map-accent', currentCourse.accent);
    if (ui.mapDifficulty) ui.mapDifficulty.textContent = `난이도 ${currentCourse.difficulty} / 5`;
    if (ui.mapDescription) ui.mapDescription.textContent = currentCourse.description;
    if (ui.mapBriefName) ui.mapBriefName.textContent = currentCourse.name.toUpperCase();
    if (ui.mapBriefDescription) ui.mapBriefDescription.textContent = currentCourse.brief;
    if (ui.mapValue) ui.mapValue.textContent = String(selectedMap + 1).padStart(2, '0');
  }

  function configureCustomCourse(mapOrCode) {
    const generated = CustomMapStore.generate(mapOrCode);
    const map = generated.map;
    const difficultyIndex = clamp(map.difficulty - 1, 0, COURSE_PRESETS.length - 1);
    const preset = COURSE_PRESETS[difficultyIndex];
    const hazard = generated.hazards;
    selectedMap = difficultyIndex;
    selectedCustomMap = map;
    currentCourse = {
      ...preset,
      name: map.name,
      short: 'CUSTOM',
      difficulty: map.difficulty,
      accent: ['#54f5ff', '#79f6ca', '#ffd45c', '#ff8c5c', '#ff4d78'][difficultyIndex],
      description: `직접 설계 · 장애물 ${map.layout.objects.filter(item => item.type !== 'checkpoint').length}개 · 난이도 ${map.difficulty}`,
      brief: `${map.verified ? '클리어 검증 완료' : '제작자 테스트 중'} · MAP ID ${generated.code}`,
      enemies: copyList(generated.enemies),
      objectives: [...preset.objectives]
    };
    floors = copyList(generated.floors);
    holes = copyList(hazard.holes);
    checkpoints = copyList(generated.checkpoints);
    boostPads = copyList(hazard.boostPads);
    slowPads = copyList(hazard.slowPads);
    pillars = copyList(hazard.pillars);
    rotors = copyList(hazard.rotors);
    movers = copyList(hazard.movers);
    gates = copyList(hazard.gates);
    launchers = copyList(hazard.launchers);
    collapseTiles = copyList(hazard.collapse);
    winds = copyList(hazard.winds);
    shockwaves = copyList(hazard.shockwaves);
    lasers = copyList(hazard.lasers);
    bumpers = copyList(hazard.bumpers);
    exit = { ...generated.exit };
    document.documentElement.style.setProperty('--map-accent', currentCourse.accent);
    if (ui.mapDifficulty) ui.mapDifficulty.textContent = `CUSTOM · 난이도 ${map.difficulty}`;
    if (ui.mapDescription) ui.mapDescription.textContent = currentCourse.description;
    if (ui.mapBriefName) ui.mapBriefName.textContent = map.name.toUpperCase();
    if (ui.mapBriefDescription) ui.mapBriefDescription.textContent = currentCourse.brief;
    if (ui.mapValue) ui.mapValue.textContent = 'CM';
    return generated;
  }

  function configureTutorialCourse() {
    selectedCustomMap = null;
    currentCourse = {
      ...COURSE_PRESETS[0],
      name: '관성 조작 연습장', short: 'TRAINING', difficulty: 1, accent: '#54f5ff',
      description: '이동·점프·부스터·브레이크를 직접 익히는 첫 플레이 연습장',
      brief: '바닥 안내를 따라 네 가지 기본 조작을 모두 사용하세요',
      zoneNames: ['이동', '점프', '부스터', '브레이크', '준비 완료'],
      objectives: ['WASD 또는 방향키로 움직여 보세요', '점프 키를 눌러 보세요', '부스터를 사용해 가속하세요', '브레이크로 관성을 줄이세요', '첫 라운드를 시작할 준비가 끝났습니다'],
      enemies: []
    };
    floors = [
      { x: 80, y: 260, w: 760, h: 1080, type: 'safe', zone: 0 },
      { x: 760, y: 260, w: 720, h: 1080, type: 'ice', zone: 1 },
      { x: 1400, y: 260, w: 800, h: 1080, type: 'black', zone: 2 }
    ];
    holes = []; boostPads = []; slowPads = [];
    checkpoints = [{ x: 430, y: 800, zone: 0 }];
    pillars = []; rotors = []; movers = []; gates = []; launchers = []; collapseTiles = [];
    winds = []; shockwaves = []; lasers = []; bumpers = [];
    exit = { x: 2050, y: 800, r: 118 };
    document.documentElement.style.setProperty('--map-accent', currentCourse.accent);
    if (ui.mapValue) ui.mapValue.textContent = 'TR';
  }

  function configureSelectedCourse() {
    return selectedCustomMap ? configureCustomCourse(selectedCustomMap) : configureCourse(selectedMap);
  }
