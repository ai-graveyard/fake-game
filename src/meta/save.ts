// 存档（PRD §7.7 记忆档 + §15.7）：只记一件事——这台设备上的玩家是否已经通关过一次。
// 用途：①真结局标记"已关闭"；②序章对回访玩家收起第一层谎言（不再演"教学就是陷阱"那出戏）。
const CLEARED_KEY = 'fakegame_cleared';

export function isReturningPlayer(): boolean {
  try {
    return localStorage.getItem(CLEARED_KEY) === '1';
  } catch {
    return false; // 隐私模式/存储被禁：当作生面孔处理，不影响可玩性
  }
}

export function markCleared(): void {
  try {
    localStorage.setItem(CLEARED_KEY, '1');
  } catch {
    /* 隐私模式忽略 */
  }
}
