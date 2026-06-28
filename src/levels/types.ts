import type { RealState } from '../engine/types';
import type { Deception, HintLevel } from '../engine/deception';

export type NarrationEvent =
  | 'start'
  | 'space'
  | 'fakeDoor'
  | 'gateOpen'
  | 'damage'
  | 'heal'
  | 'blocked'
  | 'death'
  | 'win';

// 胜利演出：funeral=葬礼（杀马特挽联），plain=朴素/坦白（风格落差即 truthSignal）
export interface WinOverlay {
  kind: 'funeral' | 'plain';
  big: string;
  elegy: string;
  sub: string;
  hint: string;
}

export interface LevelConfig {
  id: string;
  title: string;
  seed: number;
  next?: string;
  build: () => RealState;
  deceptions: Deception[];
  hintLadder: HintLevel[];
  // 施骗者对具体事件的即时反应（PRD §4，文字承载不配音）
  narrate?: (ev: NarrationEvent, real: Readonly<RealState>) => string | undefined;
  winOverlay: WinOverlay;
  // 被吹捧的"空格键"对真实血量的影响（负=扣血）。序章里它是陷阱。
  spaceDelta?: number;
  // 到达目标即直接进入 next 场景，不显示"通关卡"（第5关：走到金色终点=落入假结算的饵）
  directNext?: boolean;
}
