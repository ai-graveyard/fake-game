import type { RealState, Vec2 } from './types';
import type { Deception, HintLevel } from './deception';

// ============ DisplayState：渲染层唯一能拿到的数据（PRD §15.6）============
// 字段名刻意不同于 RealState（bloodBarFill 而非 hp），降低"误把真值塞进渲染"的概率。
export interface RenderTile {
  pos: Vec2;
  fill: string;
  glow: string;
  label: string;
}

// 飘过的签名（第2关：真按键藏在其中一条里）
export interface FloatText {
  text: string;
  xFrac: number; // 0..1 横向位置（可越界以便进出场）
  y: number; // 网格行
  color: string;
  opacity: number;
}

export interface DisplayState {
  grid: { w: number; h: number };
  view: {
    player: { pos: Vec2; color: string; shake: number };
    tiles: RenderTile[];
  };
  bloodBarFill: number; // 0..1，可能是谎言
  bloodLabel: string;
  scoreText: string;
  promptText: string; // 可能是谎言
  cornerSignature: string; // 火星文，真线索载体
  cornerOpacity: number; // 提示阶梯控制
  cornerScale: number;
  honestLight: number; // 0..1，truthSignal（M0 阶段始终诚实）
  honestBlink: boolean; // 诚实灯闪烁：规则即将漂移的预警（第3关，PRD §7.4）
  narratorLine: string;
  floats: FloatText[];
}

// 诚实投影：先按"不撒谎"的方式把 RealState 画出来，再让 deception 逐个篡改。
function honestProjection(real: Readonly<RealState>): DisplayState {
  const hpRatio = real.maxHp > 0 ? real.hp / real.maxHp : 0;
  const tiles: RenderTile[] = real.entities.map((e) => {
    switch (e.kind) {
      case 'wall':
        return { pos: e.pos, fill: '#241433', glow: 'transparent', label: '' };
      case 'fakeDoor':
        return { pos: e.pos, fill: '#1f8f4d', glow: '#39ff88', label: '门' };
      case 'realExit':
        return { pos: e.pos, fill: '#2a2030', glow: 'transparent', label: '' };
      case 'damage':
        return { pos: e.pos, fill: '#7a1530', glow: '#ff3b6b', label: '伤' };
      case 'heal':
        return { pos: e.pos, fill: '#155f3a', glow: '#39ff88', label: '愈' };
      case 'pad': {
        const color = String(e.data?.color ?? '#888888');
        return { pos: e.pos, fill: color, glow: color, label: String(e.data?.name ?? '') };
      }
      case 'checkpoint':
        return { pos: e.pos, fill: '#2b2440', glow: '#9a7bd0', label: '' };
      default:
        return { pos: e.pos, fill: '#241433', glow: 'transparent', label: '' };
    }
  });

  // 角色颜色 = 真实血量的诚实通道（PRD：真实状态线索=角色颜色）
  const playerColor = lerpColor('#6b6b6b', '#7CFFB0', hpRatio);

  return {
    grid: { ...real.grid },
    view: {
      player: { pos: { ...real.player.pos }, color: playerColor, shake: 0 },
      tiles,
    },
    bloodBarFill: hpRatio,
    bloodLabel: '血量',
    scoreText: real.score > 0 ? `分数 ${real.score}` : '',
    promptText: '',
    cornerSignature: '',
    cornerOpacity: 0.15,
    cornerScale: 1,
    honestLight: hpRatio,
    honestBlink: false,
    narratorLine: '',
    floats: [],
  };
}

// 二周目"真相视角"（PRD §7.8 / §11.3）：旁路 DisplayLayer 的所有谎言，直接渲染真实状态。
let truthMode = false;
export function setTruthMode(on: boolean): void {
  truthMode = on;
}
export function isTruthMode(): boolean {
  return truthMode;
}

// 把 RealState 经由谎言变换 + 提示阶梯，产出渲染层数据。这是唯一的渲染数据来源。
export function project(
  real: Readonly<RealState>,
  deceptions: Deception[],
  hintLadder: HintLevel[],
): DisplayState {
  const draft = honestProjection(real);

  if (truthMode) {
    annotateTruth(real, draft); // 真相视角：不施加任何谎言，老老实实显示真目标
    return draft;
  }

  for (const d of deceptions) d.transformDisplay?.(real, draft);

  // 提示阶梯：失败次数 OR 滞留 tick，取已满足的最高一级
  let activeHint: HintLevel | null = null;
  for (const h of hintLadder) {
    if (real.failCount >= h.afterFails || real.stuckTicks >= h.afterStuckTicks) {
      activeHint = h;
    }
  }
  activeHint?.apply(real, draft);

  return draft;
}

// 真相视角标注：诚实说出真目标，并高亮真目标格子。
function annotateTruth(real: Readonly<RealState>, draft: DisplayState): void {
  draft.bloodLabel = '真·血量';
  draft.cornerSignature = '真相視角 · 這次我沒騙你（敢信嗎?）';
  draft.cornerOpacity = 0.85;
  const wc = real.winCondition;
  if (wc.kind === 'realHpZero') {
    draft.promptText = '真實目標：把血量耗到 0（主動求死）';
  } else if (wc.kind === 'reachTile' || wc.kind === 'standOn') {
    draft.promptText =
      wc.kind === 'standOn' ? `真實目標：站上標記格（${wc.label}）` : '真實目標：走到標記格';
    const idx = real.entities.findIndex((e) => e.pos.x === wc.target.x && e.pos.y === wc.target.y);
    if (idx >= 0 && draft.view.tiles[idx]) {
      draft.view.tiles[idx].glow = '#28e0d0';
      draft.view.tiles[idx].label = '真';
    }
  }
}

// 颜色线性插值（#rrggbb）
export function lerpColor(a: string, b: string, t: number): string {
  const ca = hex(a);
  const cb = hex(b);
  const r = Math.round(ca[0] + (cb[0] - ca[0]) * t);
  const g = Math.round(ca[1] + (cb[1] - ca[1]) * t);
  const bl = Math.round(ca[2] + (cb[2] - ca[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

function hex(s: string): [number, number, number] {
  const h = s.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
