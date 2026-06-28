import type { RealState, WinCondition } from '../engine/types';
import type { Deception, HintLevel } from '../engine/deception';
import { mulberry32 } from '../engine/prng';
import type { LevelConfig } from './types';
import { borderWalls, tile } from './util';

const W = 16;
const H = 10;

// 三块彩色踏板：真实目标在它们之间漂移
const PADS = [
  { pos: { x: 4, y: 2 }, name: '紅', color: '#ff3b6b' },
  { pos: { x: 8, y: 7 }, name: '綠', color: '#39ff88' },
  { pos: { x: 12, y: 3 }, name: '藍', color: '#4aa8ff' },
];

const PERIOD = 60 * 9; // 每 ~9 秒漂移一次
const WARN = 72; // 漂移前 ~1.2 秒预警
const REQUIRED = 60 * 2.4; // 站稳 ~2.4 秒通关
const SEED = 99;

// 由 cycle 决定目标，纯函数 → 确定性、可复现（PRD §11.3），且避免与上个 cycle 重复。
function pick(cycle: number): number {
  return Math.floor(mulberry32(SEED + cycle)() * PADS.length) % PADS.length;
}
function targetForTick(tick: number): number {
  const cycle = Math.floor(tick / PERIOD);
  let idx = pick(cycle);
  if (cycle > 0 && idx === pick(cycle - 1)) idx = (idx + 1) % PADS.length;
  return idx;
}

function build(): RealState {
  const cy = Math.floor(H / 2);
  const entities = [
    ...borderWalls(W, H),
    ...PADS.map((p) => tile('pad', p.pos.x, p.pos.y, { color: p.color, name: p.name })),
  ];
  const first = PADS[targetForTick(0)];
  return {
    levelId: 'level3',
    tick: 0,
    grid: { w: W, h: H },
    spawn: { x: 2, y: cy },
    player: { pos: { x: 2, y: cy }, facing: { x: 1, y: 0 } },
    hp: 100,
    maxHp: 100,
    score: 0,
    entities,
    winCondition: { kind: 'standOn', target: { ...first.pos }, ticks: REQUIRED, label: first.name },
    won: false,
    dead: false,
    failCount: 0,
    stuckTicks: 0,
    visitedTiles: new Set<string>(),
    flags: {},
  };
}

// 规则漂移 + 显示：真目标写在角落火星文，临近漂移时诚实灯预警。
const drift: Deception = {
  id: 'l3-rule-drift',
  type: 'rule',
  mutateRule(_rule: WinCondition, ctx): WinCondition {
    const p = PADS[targetForTick(ctx.tick)];
    return { kind: 'standOn', target: { ...p.pos }, ticks: REQUIRED, label: p.name };
  },
  transformDisplay(real, draft) {
    const wc = real.winCondition;
    const name = wc.kind === 'standOn' ? wc.label : '?';
    const stand = Number(real.flags['standTicks']) || 0;
    const prog = wc.kind === 'standOn' ? Math.min(100, Math.round((stand / wc.ticks) * 100)) : 0;
    draft.promptText = '快到終點！把方塊都踩亮';
    draft.cornerSignature = `真實目標：站上【${name}】色方塊 ﹏ 進度 ${prog}%`;
    draft.cornerOpacity = 0.42;
    // 预警：漂移前诚实灯闪烁（PRD §7.4 把"被偷袭"变成"我注意到要变了"）
    if (real.tick % PERIOD >= PERIOD - WARN) draft.honestBlink = true;
  },
};

const hintLadder: HintLevel[] = [
  {
    afterFails: 0,
    afterStuckTicks: 60 * 28,
    apply(_r, d) {
      d.cornerOpacity = 0.9;
      d.cornerScale = 1.2;
    },
  },
];

export const level3: LevelConfig = {
  id: 'level3',
  title: '第三關 · 規則在漂移',
  seed: 31415,
  next: 'metaL4',
  build,
  deceptions: [drift],
  hintLadder,
  narrate(ev) {
    switch (ev) {
      case 'start':
        return '踩亮方塊就過關啦～(才怪)';
      default:
        return undefined;
    }
  },
  winOverlay: {
    kind: 'plain',
    big: '第三關 · 通過',
    elegy: '規則一直在變。',
    sub: '妳學會ㄌ盯著角落、跟著它變。',
    hint: '按任意鍵繼續',
  },
};
