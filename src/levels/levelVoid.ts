import type { RealState, Entity } from '../engine/types';
import type { Deception, HintLevel } from '../engine/deception';
import type { LevelConfig } from './types';
import { borderWalls, tile, wall } from './util';

const W = 11;
const H = 11;

// 第5关 · 3D 原生谎言：视差悬空（只在 3D 里成立）。
// 一条三格宽的桥（第 4/5/6 列）跨过深渊。正中央那条（第 5 列）看起来笔直、踏实，
// 还有一根柱子立在身前——可它正中间 (5,5) 其实是个被"铺平"伪装成地面的坑。
// 按 Q/E 把镜头绕到侧面，柱子让开、伪装破功，真正的坑才现形：真安全路在右侧（第 6 列）。
const TRAP = { x: 5, y: 5 }; // 伪装成安全地面的真坑（正中央诱饵道）
const DECOY = { x: 4, y: 5 }; // 诚实裸露的坑（左侧死路诱饵）
const PILLAR = { x: 5, y: 6 }; // 身前的遮挡柱（正面挡住坑的破绽）
const EXIT = { x: 5, y: 1 };

function build(): RealState {
  const walls: Entity[] = [];
  // 只开放第 4/5/6 列作走廊，其余内部格填实墙，逼出"过桥"的空间感
  for (let x = 1; x <= W - 2; x++) {
    for (let y = 1; y <= H - 2; y++) {
      if (x < 4 || x > 6) walls.push(wall(x, y));
    }
  }
  const entities = [
    ...borderWalls(W, H),
    ...walls,
    tile('realExit', EXIT.x, EXIT.y),
    tile('void', TRAP.x, TRAP.y, { amount: 55 }),
    tile('void', DECOY.x, DECOY.y, { amount: 55 }),
    tile('pillar', PILLAR.x, PILLAR.y),
  ];
  return {
    levelId: 'levelVoid',
    tick: 0,
    grid: { w: W, h: H },
    spawn: { x: 5, y: H - 2 },
    player: { pos: { x: 5, y: H - 2 }, facing: { x: 0, y: -1 } },
    cameraYaw: 0,
    hp: 100,
    maxHp: 100,
    score: 0,
    entities,
    winCondition: { kind: 'reachTile', target: { ...EXIT }, label: '绕过暗坑走到对岸出口' },
    won: false,
    dead: false,
    failCount: 0,
    stuckTicks: 0,
    visitedTiles: new Set<string>(),
    flags: {},
  };
}

function isSideView(yaw: number): boolean {
  return Math.abs(Math.sin(yaw)) > 0.5;
}

const parallax: Deception = {
  id: 'void-parallax',
  type: 'display',
  transformDisplay(real, draft) {
    const side = isSideView(real.cameraYaw);
    draft.promptText = '直直往上過橋就是出口﹏腳下の橋很穩の';
    draft.cornerSignature = side
      ? '★彡 正中央那格是空の！走右邊（第6列）繞過去 彡★'
      : '橋真の是直の嗎? 按 [Q]/[E] 繞到側面看看腳下';
    draft.cornerOpacity = side ? 0.85 : 0.4;

    real.entities.forEach((e, i) => {
      const p = draft.props[i];
      if (!p) return;
      const isTrap = e.kind === 'void' && e.pos.x === TRAP.x && e.pos.y === TRAP.y;
      if (isTrap && !side) {
        // 正面：把深渊铺平成"和周围一样的地面"，混进桥里骗你直走
        p.shape = 'platform';
        p.color = '#1c0f28';
        p.emissive = 'transparent';
        p.emissiveIntensity = 0;
        p.pos = { x: e.pos.x, y: 0.02, z: e.pos.y };
        p.size = { x: 0.98, y: 0.14, z: 0.98 };
        p.label = '';
      }
      if (e.kind === 'pillar') {
        // 正面：柱子不透明，挡住坑的破绽；侧视：让它淡去，别再帮忙遮丑
        p.opacity = side ? 0.18 : 0.95;
        p.color = '#241433';
      }
    });
  },
};

const hintLadder: HintLevel[] = [
  {
    afterFails: 1,
    afterStuckTicks: 60 * 16,
    apply(_r, d) {
      d.cornerOpacity = Math.max(d.cornerOpacity, 0.7);
      d.cornerScale = 1.15;
    },
  },
  {
    afterFails: 3,
    afterStuckTicks: 60 * 34,
    apply(_r, d) {
      d.cornerSignature = '★ 按 [Q]/[E] 轉鏡頭低頭看！正中央是坑，走右邊第 6 列 ★';
      d.cornerOpacity = 1;
      d.cornerScale = 1.3;
    },
  },
];

export const levelVoid: LevelConfig = {
  id: 'levelVoid',
  title: '第五關 · 視差懸空',
  seed: 50505,
  next: 'metaL4',
  build,
  deceptions: [parallax],
  hintLadder,
  spaceDelta: -10,
  narrate(ev) {
    switch (ev) {
      case 'start':
        return '過橋就到出口啦～腳下很穩の，別怕:)';
      case 'rotate':
        return '誒…妳幹嘛低頭看腳下。';
      case 'void':
        return '啊——腳下怎麼是空の？我不是說很穩嗎（壞笑）';
      case 'win':
        return '妳繞過ㄌ那個坑……學會先看腳下ㄌ。';
      default:
        return undefined;
    }
  },
  winOverlay: {
    kind: 'plain',
    big: '第五關 · 通過',
    elegy: '妳低頭看ㄌ腳下，繞過那個被鋪平の坑。',
    sub: '在 3D 裡，"安全の地面"可能只是換個角度沒看到の深淵。',
    hint: '按任意鍵繼續',
  },
};
