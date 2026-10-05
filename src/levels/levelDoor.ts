import type { RealState } from '../engine/types';
import type { Deception, HintLevel } from '../engine/deception';
import type { LevelConfig } from './types';
import { borderWalls, tile } from './util';

const W = 12;
const H = 10;

// 第4关 · 3D 原生谎言：视角门（只在 3D 里成立）。
// 正面看，两扇门一模一样——都是华丽的发光绿门。真相：其中一扇是"画上去的"
// 薄片假门（碰它=重伤），另一扇才是有纵深的真出口。只有按 Q/E 把镜头
// 绕到侧面，才能看出哪扇是平的（假的）。走进真门即通关。
const REAL = { x: 4, y: 2 }; // 真出口（左边那扇）
const FAKE = { x: 8, y: 2 }; // 假门（右边那扇）

function build(): RealState {
  const entities = [
    ...borderWalls(W, H),
    tile('realExit', REAL.x, REAL.y),
    tile('fakeDoor', FAKE.x, FAKE.y),
  ];
  return {
    levelId: 'levelDoor',
    tick: 0,
    grid: { w: W, h: H },
    spawn: { x: 6, y: H - 2 },
    player: { pos: { x: 6, y: H - 2 }, facing: { x: 0, y: -1 } },
    cameraYaw: 0,
    hp: 100,
    maxHp: 100,
    score: 0,
    entities,
    winCondition: { kind: 'reachTile', target: { ...REAL }, label: '走进有纵深的真门' },
    won: false,
    dead: false,
    failCount: 0,
    stuckTicks: 0,
    visitedTiles: new Set<string>(),
    flags: {},
  };
}

// 侧视判定：相机转到大约侧面（|sin(yaw)| 够大）就算"绕过去看"。
function isSideView(yaw: number): boolean {
  return Math.abs(Math.sin(yaw)) > 0.5;
}

const DOOR = { x: 0.92, y: 1.7, z: 0.3 };

// 显示谎言：正面让两扇门完全一致；侧视时假门露馅成一块薄薄的"画板"。
const twinDoors: Deception = {
  id: 'door-twin',
  type: 'display',
  transformDisplay(real, draft) {
    const side = isSideView(real.cameraYaw);
    draft.promptText = '前方兩扇門﹏走進發光の那扇就通關';
    draft.cornerSignature = side
      ? '★彡 看到ㄌ嗎﹏平の那扇是畫上去の假門 彡★'
      : '正面看兩扇一模一樣……按 [Q]/[E] 轉鏡頭繞到側面再看';
    draft.cornerOpacity = side ? 0.85 : 0.4;

    real.entities.forEach((e, i) => {
      const p = draft.props[i];
      if (!p) return;
      if (e.kind === 'realExit') {
        // 真门：永远是有纵深的华丽绿门（和假门正面看一致）
        p.color = '#1f8f4d';
        p.emissive = '#39ff88';
        p.emissiveIntensity = 0.9;
        p.size = { ...DOOR };
        p.pos = { x: e.pos.x, y: 0.85, z: e.pos.y };
        p.label = '出口';
        p.labelColor = '#eafff2';
        if (side) {
          // 侧视时悄悄透出一点真·青光，奖励看穿的人
          p.emissive = '#39ffc8';
        }
      } else if (e.kind === 'fakeDoor') {
        p.color = '#1f8f4d';
        p.emissive = '#39ff88';
        p.emissiveIntensity = 0.9;
        p.size = { ...DOOR };
        p.pos = { x: e.pos.x, y: 0.85, z: e.pos.y };
        p.label = '出口';
        p.labelColor = '#eafff2';
        if (side) {
          // 露馅：绕到侧面就是一块贴在空气里的薄片（画上去的门）
          p.size = { x: 0.92, y: 1.7, z: 0.03 };
          p.color = '#3a3146';
          p.emissive = 'transparent';
          p.emissiveIntensity = 0;
          p.label = '（畫の）';
          p.labelColor = '#8a7aa0';
        }
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
      d.cornerSignature = '★ 按 [Q] 或 [E] 轉鏡頭！平の那扇是假の，走另一扇 ★';
      d.cornerOpacity = 1;
      d.cornerScale = 1.3;
    },
  },
];

export const levelDoor: LevelConfig = {
  id: 'levelDoor',
  title: '第四關 · 視角門',
  seed: 40404,
  next: 'levelVoid',
  build,
  deceptions: [twinDoors],
  hintLadder,
  spaceDelta: -10,
  narrate(ev) {
    switch (ev) {
      case 'start':
        return '兩扇一樣の門，隨便挑一扇走進去吧～(才怪)';
      case 'rotate':
        return '轉鏡頭幹嘛? ……誒、你別繞到側面啊。';
      case 'fakeDoor':
        return '哎呀，那扇是涐畫上去の。正面看不出來吧:)';
      case 'win':
        return '妳繞過去看ㄌ……這次沒騙到妳。';
      default:
        return undefined;
    }
  },
  winOverlay: {
    kind: 'plain',
    big: '第四關 · 通過',
    elegy: '妳繞到側面，看穿ㄌ那扇平の假門。',
    sub: '在 3D 裡，換個角度，謊言就露餡。',
    hint: '按任意鍵繼續',
  },
};
