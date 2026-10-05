import type { RealState, Vec2, Vec3 } from './types';
import type { Deception, HintLevel } from './deception';

// ============ DisplayState：渲染层唯一能拿到的数据（PRD §15.6）============
// 3D 化后，渲染数据从"2D 砖块"升级成"3D 场景描述"（道具 + 相机 + 灯光），
// 但纪律不变：RealState→谎言→DisplayState→渲染，渲染层只能吃 DisplayState。
// 字段名刻意不同于 RealState（bloodBarFill 而非 hp），降低"误把真值塞进渲染"的概率。

// 一件 3D 道具。渲染层照着 shape/pos/size/color 摆方块，不知道它"真实"是什么。
export type PropShape =
  | 'block' // 实心方块（墙）
  | 'platform' // 薄板（踏板 / 伤害砖 / 治疗砖）
  | 'door' // 立着的门（真出口 / 假门）
  | 'pillar' // 高柱（视觉遮挡物）
  | 'hole' // 深渊 / 坑
  | 'marker'; // 发光标记

export interface RenderProp {
  id: string;
  pos: Vec3; // 世界坐标中心（x=列, z=行, y=高度）
  size: Vec3;
  color: string;
  emissive: string; // 自发光色（glow）；'transparent' 表示不发光
  emissiveIntensity: number;
  opacity: number; // 0..1
  label: string; // 道具上方的漂浮文字（可为空）
  labelColor: string;
  shape: PropShape;
  visible: boolean; // 角度相关的"显形/隐形"（视差谎言用）
}

// 飘过的签名（第2关：真按键藏在其中一条里）。渲染为 HUD 屏幕空间漂移文字。
export interface FloatText {
  text: string;
  xFrac: number; // 0..1 横向位置（可越界以便进出场）
  y: number; // 网格行（渲染层据此换算成纵向位置）
  color: string;
  opacity: number;
}

// 相机：玩家用 Q/E 转 yaw。渲染层据此环绕网格中心俯视。
export interface CameraView {
  yaw: number; // 绕 Y 轴偏航（弧度）
  pitch: number; // 俯仰（弧度，向下看）
  distance: number; // 相机到目标的距离
  targetHeight: number; // 看向的目标高度
}

export interface DisplayState {
  grid: { w: number; h: number };
  player: { pos: Vec3; color: string; shake: number; facing: Vec2 };
  props: RenderProp[];
  camera: CameraView;
  ambient: number; // 环境光强度（可为戏剧效果调暗）
  // HUD（DOM）字段——血条/提示可能撒谎；角落签名/诚实灯是真线索通道。
  bloodBarFill: number; // 0..1，可能是谎言
  bloodLabel: string;
  scoreText: string;
  promptText: string; // 可能是谎言
  cornerSignature: string; // 火星文，真线索载体
  cornerOpacity: number; // 提示阶梯控制
  cornerScale: number;
  honestLight: number; // 0..1，truthSignal（从不撒谎的像素灯）
  honestBlink: boolean; // 诚实灯闪烁：规则即将漂移的预警（第3关，PRD §7.4）
  narratorLine: string;
  floats: FloatText[];
}

// 默认俯视相机：等距感的 3/4 视角，距离随网格大小自适应。
function defaultCamera(real: Readonly<RealState>): CameraView {
  const span = Math.max(real.grid.w, real.grid.h);
  return {
    yaw: real.cameraYaw,
    pitch: 0.62, // ~35.5°，俯视但保留纵深
    distance: span * 1.05 + 4,
    targetHeight: 0.4,
  };
}

// 诚实投影：先按"不撒谎"的方式把 RealState 摆成 3D 场景，再让 deception 逐个篡改。
function honestProjection(real: Readonly<RealState>): DisplayState {
  const hpRatio = real.maxHp > 0 ? real.hp / real.maxHp : 0;
  const props: RenderProp[] = real.entities.map((e) => propForEntity(e.id, e.kind, e.pos, e.data));

  // 角色颜色 = 真实血量的诚实通道（PRD：真实状态线索=角色颜色）
  const playerColor = lerpColor('#6b6b6b', '#7CFFB0', hpRatio);

  return {
    grid: { ...real.grid },
    player: {
      pos: { x: real.player.pos.x, y: 0.42, z: real.player.pos.y },
      color: playerColor,
      shake: 0,
      facing: { ...real.player.facing },
    },
    props,
    camera: defaultCamera(real),
    ambient: 0.55,
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

// 单个实体 → 诚实的 3D 道具。index 对齐 real.entities，谎言可按下标继续改。
function propForEntity(
  id: string,
  kind: string,
  pos: Vec2,
  data?: Record<string, number | string | boolean>,
): RenderProp {
  const base = {
    id,
    pos: { x: pos.x, y: 0.5, z: pos.y } as Vec3,
    size: { x: 1, y: 1, z: 1 } as Vec3,
    color: '#241433',
    emissive: 'transparent',
    emissiveIntensity: 0,
    opacity: 1,
    label: '',
    labelColor: '#ffffff',
    shape: 'block' as PropShape,
    visible: true,
  };
  switch (kind) {
    case 'wall':
      return base;
    case 'fakeDoor':
      // 华丽的绿色大门：高、窄、发光（骗你去撞）
      return {
        ...base,
        pos: { x: pos.x, y: 0.85, z: pos.y },
        size: { x: 0.92, y: 1.7, z: 0.3 },
        color: '#1f8f4d',
        emissive: '#39ff88',
        emissiveIntensity: 0.9,
        label: '门',
        shape: 'door',
      };
    case 'realExit':
      // 真出口：朴素、暗，几乎不发光——藏在角落
      return {
        ...base,
        pos: { x: pos.x, y: 0.7, z: pos.y },
        size: { x: 0.8, y: 1.4, z: 0.22 },
        color: '#2a2030',
        emissive: 'transparent',
        emissiveIntensity: 0,
        shape: 'door',
      };
    case 'damage':
      return {
        ...base,
        pos: { x: pos.x, y: 0.08, z: pos.y },
        size: { x: 0.9, y: 0.16, z: 0.9 },
        color: '#7a1530',
        emissive: '#ff3b6b',
        emissiveIntensity: 0.6,
        label: '伤',
        shape: 'platform',
      };
    case 'heal':
      return {
        ...base,
        pos: { x: pos.x, y: 0.08, z: pos.y },
        size: { x: 0.9, y: 0.16, z: 0.9 },
        color: '#155f3a',
        emissive: '#39ff88',
        emissiveIntensity: 0.6,
        label: '愈',
        shape: 'platform',
      };
    case 'pad': {
      const color = String(data?.color ?? '#888888');
      return {
        ...base,
        pos: { x: pos.x, y: 0.1, z: pos.y },
        size: { x: 0.92, y: 0.2, z: 0.92 },
        color,
        emissive: color,
        emissiveIntensity: 0.7,
        label: String(data?.name ?? ''),
        shape: 'platform',
      };
    }
    case 'checkpoint':
      return {
        ...base,
        pos: { x: pos.x, y: 0.06, z: pos.y },
        size: { x: 0.9, y: 0.12, z: 0.9 },
        color: '#2b2440',
        emissive: '#9a7bd0',
        emissiveIntensity: 0.5,
        shape: 'platform',
      };
    case 'void':
      // 诚实投影：就是个明晃晃的黑坑（谎言会把它演成安全平台）
      return {
        ...base,
        pos: { x: pos.x, y: -0.5, z: pos.y },
        size: { x: 0.98, y: 1, z: 0.98 },
        color: '#07040c',
        emissive: 'transparent',
        emissiveIntensity: 0,
        shape: 'hole',
      };
    case 'pillar':
      // 纯视觉遮挡柱：半透明、不挡路（诚实时也不碍事）
      return {
        ...base,
        pos: { x: pos.x, y: 1.1, z: pos.y },
        size: { x: 0.55, y: 2.2, z: 0.55 },
        color: '#2a1b3d',
        emissive: 'transparent',
        emissiveIntensity: 0,
        opacity: 0.4,
        shape: 'pillar',
      };
    default:
      return base;
  }
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

// 真相视角标注：诚实说出真目标，并高亮真目标道具。
function annotateTruth(real: Readonly<RealState>, draft: DisplayState): void {
  draft.bloodLabel = '真·血量';
  draft.cornerSignature = '真相視角 · 這次我沒騙你（敢信嗎?）';
  draft.cornerOpacity = 0.85;
  draft.ambient = 0.75; // 真相视角把灯光调亮，别再故弄玄虚
  const wc = real.winCondition;
  if (wc.kind === 'realHpZero') {
    draft.promptText = '真實目標：把血量耗到 0（主動求死）';
  } else if (wc.kind === 'reachTile' || wc.kind === 'standOn') {
    draft.promptText =
      wc.kind === 'standOn' ? `真實目標：站上標記格（${wc.label}）` : '真實目標：走到標記格';
    const idx = real.entities.findIndex((e) => e.pos.x === wc.target.x && e.pos.y === wc.target.y);
    if (idx >= 0 && draft.props[idx]) {
      draft.props[idx].emissive = '#28e0d0';
      draft.props[idx].emissiveIntensity = 1;
      draft.props[idx].label = '真';
      draft.props[idx].visible = true;
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
