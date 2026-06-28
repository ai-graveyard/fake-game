import type { RealState, DeceptionCtx, GameAction, WinCondition } from './types';
import type { DisplayState } from './displayLayer';

// 每个谎言是一个可插拔模块（PRD §11.1）。
// - transformDisplay：篡改"看到的东西"（在 DisplayLayer 内被调用）
// - remapInput：把物理键重映射成别的动作
// - mutateRule：让真实通关条件漂移（L3）。随机性/时间从 ctx 注入，禁止内部用 Math.random/Date.now。
export interface Deception {
  id: string;
  type: 'display' | 'instruction' | 'rule' | 'meta';
  transformDisplay?: (real: Readonly<RealState>, draft: DisplayState) => void;
  remapInput?: (code: string) => GameAction | null;
  mutateRule?: (rule: WinCondition, ctx: DeceptionCtx) => WinCondition;
}

// 提示阶梯的一级（PRD §9）：只缩短"发现路径"，永不替玩家完成"反向操作"。
export interface HintLevel {
  // 触发：失败次数 OR 滞留 tick（取先到者）
  afterFails: number;
  afterStuckTicks: number;
  // 该级对显示层施加的强化（在所有 deception 之后应用）
  apply: (real: Readonly<RealState>, draft: DisplayState) => void;
}
