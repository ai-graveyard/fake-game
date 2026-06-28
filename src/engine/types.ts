import type { PRNG } from './prng';

export type Vec2 = { x: number; y: number };

export function veq(a: Vec2, b: Vec2): boolean {
  return a.x === b.x && a.y === b.y;
}

// 玩家输入解析后的"真实动作"（PRD §11.4）。
// 注意三分概念：提示键(谎言) / 物理键(event.code) / 真实动作——此处是最后一层。
export type GameAction =
  | { kind: 'move'; dx: number; dy: number }
  | { kind: 'space' } // 被教学吹捧的那个键（往往是陷阱）
  | { kind: 'confirm' } // 真正的确认/交互键
  | { kind: 'none' };

// 世界里的实体。kind 决定"真实行为"；显示层 + 谎言决定它"看起来"是什么。
export type EntityKind =
  | 'wall'
  | 'fakeDoor' // 华丽的假门：碰它/对它确认 = 受真实伤害
  | 'realExit' // 真出口：朴素、藏角落
  | 'damage' // 踩上去扣真实血量（在第1关里这是通往胜利的路）
  | 'heal' // 踩上去回真实血量（在第1关里这是远离胜利）
  | 'pad' // 彩色踏板（第3关：真实目标在它们之间漂移）
  | 'checkpoint';

export interface Entity {
  id: string;
  pos: Vec2;
  kind: EntityKind;
  data?: Record<string, number | string | boolean>;
}

// 通关条件做成可序列化的标签对象（便于确定性测试与真相回放，PRD §11.3）。
export type WinCondition =
  | { kind: 'reachTile'; target: Vec2; label: string }
  | { kind: 'realHpZero'; label: string } // 主动求死（杀手级时刻，PRD §1.2）
  | { kind: 'standOn'; target: Vec2; ticks: number; label: string };

// ============ RealState：真实状态，渲染层不可直接读（PRD §15.6）============
export interface RealState {
  levelId: string;
  tick: number; // 离散逻辑步（非墙钟时间）
  grid: { w: number; h: number };
  spawn: Vec2;
  player: { pos: Vec2; facing: Vec2 };
  hp: number; // 真实血量
  maxHp: number;
  score: number;
  entities: Entity[];
  winCondition: WinCondition;
  won: boolean;
  dead: boolean;
  // 引导/提示阶梯所需的统计
  failCount: number;
  stuckTicks: number; // 距上次"有意义进展"的 tick 数
  visitedTiles: Set<string>;
  // 叙事旗标（真结局回收用）
  flags: Record<string, number | boolean>;
}

export interface DeceptionCtx {
  tick: number;
  rng: PRNG;
}
