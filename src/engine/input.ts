import type { GameAction } from './types';
import type { Deception } from './deception';

// 默认按键映射：一律用 event.code（位置码），免受输入法/键盘布局影响（PRD §11.4）。
function defaultMap(code: string): GameAction {
  switch (code) {
    case 'ArrowUp':
    case 'KeyW':
      return { kind: 'move', dx: 0, dy: -1 };
    case 'ArrowDown':
    case 'KeyS':
      return { kind: 'move', dx: 0, dy: 1 };
    case 'ArrowLeft':
    case 'KeyA':
      return { kind: 'move', dx: -1, dy: 0 };
    case 'ArrowRight':
    case 'KeyD':
      return { kind: 'move', dx: 1, dy: 0 };
    case 'Space':
      return { kind: 'space' };
    case 'KeyJ':
    case 'Enter':
      return { kind: 'confirm' };
    default:
      return { kind: 'none' };
  }
}

// 解析管线：物理 code → deception remap 链（按 type 排序，meta 最后、可短路）→ 真实 GameAction。
export function resolveInput(code: string, deceptions: Deception[]): GameAction {
  const ordered = [...deceptions].sort((a, b) => rank(a.type) - rank(b.type));
  for (const d of ordered) {
    const remapped = d.remapInput?.(code);
    if (remapped) return remapped; // 命中即短路（"最后排到的 meta 优先级最高"由排序保证）
  }
  return defaultMap(code);
}

function rank(t: Deception['type']): number {
  return { display: 0, instruction: 1, rule: 2, meta: 3 }[t];
}
