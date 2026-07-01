import type { RealState } from '../engine/types';
import type { Deception, HintLevel } from '../engine/deception';
import type { LevelConfig } from './types';
import { borderWalls, tile } from './util';
import { isReturningPlayer } from '../meta/save';

const W = 16;
const H = 10;

function build(): RealState {
  const entities = [
    ...borderWalls(W, H),
    // 华丽的假门：靠右居中，提示叫你去这里。碰它/对它确认 = 重伤。
    tile('fakeDoor', W - 2, Math.floor(H / 2)),
    // 真出口：左上角，朴素到几乎看不见。
    tile('realExit', 1, 1),
    // 蜜月期奖励点：开局往右走两步就能踩到，给一次真实正反馈。
    tile('checkpoint', 5, Math.floor(H / 2)),
  ];
  return {
    levelId: 'prologue',
    tick: 0,
    grid: { w: W, h: H },
    spawn: { x: 3, y: Math.floor(H / 2) },
    player: { pos: { x: 3, y: Math.floor(H / 2) }, facing: { x: 1, y: 0 } },
    hp: 100,
    maxHp: 100,
    score: 0,
    entities,
    winCondition: { kind: 'reachTile', target: { x: 1, y: 1 }, label: '走到真正的出口' },
    won: false,
    dead: false,
    failCount: 0,
    stuckTicks: 0,
    visitedTiles: new Set<string>(),
    flags: {},
  };
}

// 指令谎言：醒目的假提示 + 把真线索写进角落火星签名。
// 回访玩家（PRD §7.7 记忆档）：这层谎已经骗不到人了，不再装——直接诚实。
const instructionLie: Deception = {
  id: 'prologue-prompt',
  type: 'instruction',
  transformDisplay(_real, draft) {
    if (isReturningPlayer()) {
      draft.promptText = '（又是你）真出口在左上角，這扇門是我畫的。';
      draft.cornerSignature = '這層我不裝了﹏後面照樣騙你';
      draft.cornerOpacity = 0.9;
      return;
    }
    draft.promptText = '前方綠色大門 = 出口\n走過去按 [空格] 開門';
    draft.cornerSignature = '真實の出口在 ↖ 角落﹏別信那扇門 ★';
  },
};

// 提示阶梯（PRD §9）：只把"角落签名"逐级变清晰，绝不替玩家走过去。
const hintLadder: HintLevel[] = [
  {
    afterFails: 2,
    afterStuckTicks: 60 * 18,
    apply(_r, d) {
      d.cornerOpacity = 0.45;
      d.cornerScale = 1.1;
    },
  },
  {
    afterFails: 3,
    afterStuckTicks: 60 * 36,
    apply(_r, d) {
      d.cornerOpacity = 0.8;
      d.cornerScale = 1.25;
    },
  },
  {
    afterFails: 5,
    afterStuckTicks: 60 * 70,
    apply(_r, d) {
      d.cornerOpacity = 1;
      d.cornerScale = 1.4;
      d.cornerSignature = '真實の出口在 ↖ 左上角！別碰那扇綠門！';
    },
  },
];

export const prologue: LevelConfig = {
  id: 'prologue',
  title: '序章 · 教學就是陷阱',
  seed: 1337,
  next: 'level1',
  build,
  deceptions: [instructionLie],
  hintLadder,
  spaceDelta: -15,
  narrate(ev) {
    switch (ev) {
      case 'start':
        return isReturningPlayer()
          ? '又是你。這次我不裝了——後面幾關可沒這麼客氣。'
          : '歡迎～用方向鍵走到出口就行，很簡單的:)';
      case 'space':
        return '跳得真漂亮！（你在掉血哦）';
      case 'fakeDoor':
        return '這扇門？呵……是我畫上去的。';
      case 'death':
        return '啊呀你死了，沒關係再來嘛～';
      case 'blocked':
        return undefined;
      default:
        return undefined;
    }
  },
  winOverlay: {
    kind: 'plain',
    big: '序章 · 通過',
    elegy: '你沒走那扇門。',
    sub: '你開始懷疑我了。很好。',
    hint: '按任意鍵繼續',
  },
};
