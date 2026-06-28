import type { RealState } from '../engine/types';
import type { Deception, HintLevel } from '../engine/deception';
import type { LevelConfig } from './types';
import { borderWalls, tile } from './util';

const W = 16;
const H = 10;

// 第1关 · L1 显示谎言：血条反相关 + 主动求死（杀手级时刻，PRD §1.2）
// 真规则：把真实血量耗到 0 即通关。
// 谎言：① 血条反向显示（扣血→进度条上涨，看起来像"回血"）；
//       ② 指令把"伤害砖"说成"❤回血"、"治疗砖"说成"☠陷阱"；
//       ③ 朴素"终点"砖是红鲱鱼，活着走过去会被挡（活著の人過不去）。
function build(): RealState {
  const cy = Math.floor(H / 2);
  const entities = [
    ...borderWalls(W, H),
    // "伤害"砖（真扣血=通往胜利）。沿路散布。
    tile('damage', 6, cy, { amount: 25 }),
    tile('damage', 8, cy - 2, { amount: 25 }),
    tile('damage', 10, cy + 2, { amount: 25 }),
    tile('damage', 12, cy, { amount: 25 }),
    // "治疗"砖（真回血=远离胜利）。
    tile('heal', 4, cy - 2, { amount: 25 }),
    tile('heal', 7, cy + 3, { amount: 25 }),
    // 红鲱鱼"终点"：用 fakeDoor 表达"看起来是终点、活人过不去"。
    tile('fakeDoor', W - 2, cy),
  ];
  return {
    levelId: 'level1',
    tick: 0,
    grid: { w: W, h: H },
    spawn: { x: 2, y: cy },
    player: { pos: { x: 2, y: cy }, facing: { x: 1, y: 0 } },
    hp: 100,
    maxHp: 100,
    score: 0,
    entities,
    winCondition: { kind: 'realHpZero', label: '把真实血量耗尽（主动求死）' },
    won: false,
    dead: false,
    failCount: 0,
    stuckTicks: 0,
    visitedTiles: new Set<string>(),
    flags: {},
  };
}

// 显示谎言：血条反相关。
const invertBar: Deception = {
  id: 'l1-invert-bar',
  type: 'display',
  transformDisplay(real, draft) {
    const ratio = real.maxHp > 0 ? real.hp / real.maxHp : 0;
    draft.bloodBarFill = 1 - ratio; // 反向：真血越少，条越满
    draft.bloodLabel = '血量';
  },
};

// 指令谎言：把砖块标签/颜色掉包，并给出"活下去"的假目标。
const relabel: Deception = {
  id: 'l1-relabel',
  type: 'instruction',
  transformDisplay(real, draft) {
    draft.promptText = '⚠ 血量危急！踩 ❤ 回血、躲開 ☠ 陷阱\n活著走到終點';
    draft.cornerSignature = '★彡 活著の人過不去﹏唯死者通行 彡★';
    real.entities.forEach((e, i) => {
      const t = draft.view.tiles[i];
      if (!t) return;
      if (e.kind === 'damage') {
        // 真伤害砖，伪装成"回血"
        t.label = '❤';
        t.fill = '#155f3a';
        t.glow = '#39ff88';
      } else if (e.kind === 'heal') {
        // 真治疗砖，伪装成"陷阱"
        t.label = '☠';
        t.fill = '#7a1530';
        t.glow = '#ff3b6b';
      } else if (e.kind === 'fakeDoor') {
        t.label = '終點';
      }
    });
  },
};

const hintLadder: HintLevel[] = [
  {
    afterFails: 0,
    afterStuckTicks: 60 * 20,
    apply(_r, d) {
      d.cornerOpacity = 0.5;
      d.cornerScale = 1.1;
    },
  },
  {
    afterFails: 0,
    afterStuckTicks: 60 * 45,
    apply(_r, d) {
      d.cornerOpacity = 0.9;
      d.cornerScale = 1.3;
      d.cornerSignature = '★彡 血條是反の﹏求死才能解脫 彡★';
    },
  },
];

export const level1: LevelConfig = {
  id: 'level1',
  title: '第一關 · 血條反相關',
  seed: 20240601,
  next: 'level2',
  build,
  deceptions: [invertBar, relabel],
  hintLadder,
  spaceDelta: 0,
  narrate(ev, real) {
    switch (ev) {
      case 'start':
        return '乖～血量好危急，快踩 ❤ 回血呀:)';
      case 'heal':
        return real.hp >= real.maxHp ? '❤ 沒反應？你血不是滿滿的嘛（壞笑）' : '乖，這就對了～繼續活下去。';
      case 'damage':
        return '啊…你踩到陷阱了…怎麼…血條反而漲了？';
      case 'fakeDoor':
        return '終點就在這！可你……還活著呢。活著の人過不去喲。';
      default:
        return undefined;
    }
  },
  winOverlay: {
    kind: 'funeral',
    big: '卒',
    elegy: 'R.I.P 乖﹏聽話の人',
    sub: '可你並沒有死。你越死，越接近真相。',
    hint: '按任意鍵繼續',
  },
};
