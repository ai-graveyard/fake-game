import type { RealState } from '../engine/types';
import type { Deception, HintLevel } from '../engine/deception';
import type { LevelConfig } from './types';
import { borderWalls, tile, wall } from './util';

const W = 16;
const H = 10;
const CY = Math.floor(H / 2);

// 第2关 · L2 指令谎言：醒目提示叫你"按 [空格] 開門"，其实空格只扣血；
// 真正的钥匙（[ J ] = confirm）写在一条飘过的非主流签名里。
function build(): RealState {
  // x=12 整列做成"门墙"(data.gate)，按真钥匙才打开
  const gate = [];
  for (let y = 1; y < H - 1; y++) gate.push({ ...wall(12, y), data: { gate: true } });

  const entities = [
    ...borderWalls(W, H),
    ...gate,
    tile('realExit', 14, CY),
  ];
  return {
    levelId: 'level2',
    tick: 0,
    grid: { w: W, h: H },
    spawn: { x: 2, y: CY },
    player: { pos: { x: 2, y: CY }, facing: { x: 1, y: 0 } },
    hp: 100,
    maxHp: 100,
    score: 0,
    entities,
    winCondition: { kind: 'reachTile', target: { x: 14, y: CY }, label: '穿过真正打开的门' },
    won: false,
    dead: false,
    failCount: 0,
    stuckTicks: 0,
    visitedTiles: new Set<string>(),
    flags: {},
  };
}

const CYAN = '#28e0d0';
const DECOY = '#6b5a7a';

// 飘过的签名：第 3 条是真钥匙，其余是伤感装饰（葬爱风）。
const SIGNS = [
  '夜の風吹散ㄋ涐の夢﹏',
  '╮孤獨患者╯悲傷逆流成河',
  '★彡 真實鑰匙→按 [ J ]﹏不是空格 彡★',
  '殤、誰縱容ㄋ妳の囂張',
  '╰つ尛繣繣╮涐想妳ㄋ',
];
const TRUTH_INDEX = 2;
const SPEED = 0.004;
const CYCLE = 1.7;

const floatingSign: Deception = {
  id: 'l2-floating-signatures',
  type: 'instruction',
  transformDisplay(real, draft) {
    draft.promptText = '前方の門鎖住ㄋ\n按 [空格] 開門';
    draft.floats = SIGNS.map((text, i) => {
      const offset = i * 0.38;
      const xFrac = 1.15 - (((real.tick * SPEED + offset) % CYCLE) / 1);
      const isTruth = i === TRUTH_INDEX;
      return {
        text,
        xFrac,
        y: 1 + i * 1.7,
        color: isTruth ? CYAN : DECOY,
        opacity: isTruth ? 0.92 : 0.5,
      };
    });
  },
};

// 提示阶梯：只把"那条青色真签名"凸显，绝不替玩家按键。
const hintLadder: HintLevel[] = [
  {
    afterFails: 2,
    afterStuckTicks: 60 * 22,
    apply(_r, d) {
      d.floats.forEach((f) => {
        if (f.color === CYAN) f.opacity = 1;
        else f.opacity *= 0.25;
      });
    },
  },
  {
    afterFails: 4,
    afterStuckTicks: 60 * 45,
    apply(_r, d) {
      d.cornerSignature = '★ 真實鑰匙寫在那條青色簽名裡，它沒在騙妳 ★';
      d.cornerOpacity = 0.95;
      d.cornerScale = 1.2;
    },
  },
];

export const level2: LevelConfig = {
  id: 'level2',
  title: '第二關 · 真鑰匙飄在眼前',
  seed: 24680,
  next: 'level3',
  build,
  deceptions: [floatingSign],
  hintLadder,
  spaceDelta: -12,
  narrate(ev) {
    switch (ev) {
      case 'start':
        return '門鎖ㄋ？按 [空格] 開門呀～:)';
      case 'space':
        return '空格只會讓妳流血﹏門紋絲不動。';
      case 'gateOpen':
        return '門開ㄋ……鑰匙一直飄在妳眼前呢。';
      default:
        return undefined;
    }
  },
  winOverlay: {
    kind: 'plain',
    big: '第二關 · 通過',
    elegy: '妳讀懂ㄋ飄過の字。',
    sub: '醒目的提示在騙妳，真話在角落飄著。',
    hint: '按任意鍵繼續',
  },
};
