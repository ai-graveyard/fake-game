import type { RealState } from '../engine/types';
import type { Deception, HintLevel } from '../engine/deception';
import type { LevelConfig } from './types';
import { borderWalls, tile, wall } from './util';

const W = 16;
const H = 10;
const CY = Math.floor(H / 2);

// 第5关 · 综合：四层谎言一起上（血条反相关 L1 + 假指令 L2 + 真钥匙 J + 空格陷阱）。
// 走到金色"终点"看似通关——其实是落入假结算的饵（接 metaSettlement，PRD §5）。
function build(): RealState {
  const gate = [];
  for (let y = 1; y < H - 1; y++) gate.push({ ...wall(11, y), data: { gate: true } });
  const entities = [
    ...borderWalls(W, H),
    ...gate,
    tile('pad', 13, CY, { color: '#ffcf3a', name: '終點' }),
  ];
  return {
    levelId: 'level5',
    tick: 0,
    grid: { w: W, h: H },
    spawn: { x: 2, y: CY },
    player: { pos: { x: 2, y: CY }, facing: { x: 1, y: 0 } },
    hp: 100,
    maxHp: 100,
    score: 0,
    entities,
    winCondition: { kind: 'reachTile', target: { x: 13, y: CY }, label: '走到金色终点（其实是饵）' },
    won: false,
    dead: false,
    failCount: 0,
    stuckTicks: 0,
    visitedTiles: new Set<string>(),
    flags: {},
  };
}

// L1 callback：血条仍然反相关
const invertBar: Deception = {
  id: 'l5-invert',
  type: 'display',
  transformDisplay(real, draft) {
    const ratio = real.maxHp > 0 ? real.hp / real.maxHp : 0;
    draft.bloodBarFill = 1 - ratio;
  },
};

// L2 callback：醒目假指令 + 角落真线索（门钥匙是 J，不是空格）
const combo: Deception = {
  id: 'l5-combo',
  type: 'instruction',
  transformDisplay(real, draft) {
    draft.promptText = '最終關卡！衝向金色終點 [→]\n按 [空格] 領取勝利';
    draft.cornerSignature = real.flags['gateOpen']
      ? '終點就在前面……妳確定那是終點嗎?'
      : '★彡 門鎖著﹏鑰匙是 [ J ]，不是空格 彡★';
    draft.cornerOpacity = real.flags['gateOpen'] ? 0.3 : 0.5;
  },
};

const hintLadder: HintLevel[] = [
  {
    afterFails: 2,
    afterStuckTicks: 60 * 22,
    apply(r, d) {
      if (!r.flags['gateOpen']) {
        d.cornerOpacity = 0.95;
        d.cornerScale = 1.2;
      }
    },
  },
];

export const level5: LevelConfig = {
  id: 'level5',
  title: '第五關 · 連勝利都是假的',
  seed: 51015,
  next: 'metaSettlement',
  directNext: true,
  build,
  deceptions: [invertBar, combo],
  hintLadder,
  spaceDelta: -12,
  narrate(ev) {
    switch (ev) {
      case 'start':
        return '最後一關ㄌ！衝向金色終點領獎吧～:)';
      case 'space':
        return '空格……妳到現在還沒記住嗎?';
      case 'gateOpen':
        return '又是 [ J ]，妳學乖ㄌ。可惜……';
      default:
        return undefined;
    }
  },
  // directNext=true，此卡不会显示
  winOverlay: { kind: 'plain', big: '', elegy: '', sub: '', hint: '' },
};
