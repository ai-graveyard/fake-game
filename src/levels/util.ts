import type { Entity, Vec2 } from '../engine/types';

// 在网格四周加一圈墙
export function borderWalls(w: number, h: number): Entity[] {
  const walls: Entity[] = [];
  for (let x = 0; x < w; x++) {
    walls.push(wall(x, 0));
    walls.push(wall(x, h - 1));
  }
  for (let y = 1; y < h - 1; y++) {
    walls.push(wall(0, y));
    walls.push(wall(w - 1, y));
  }
  return walls;
}

export function wall(x: number, y: number): Entity {
  return { id: `wall-${x}-${y}`, pos: { x, y }, kind: 'wall' };
}

export function tile(kind: Entity['kind'], x: number, y: number, data?: Entity['data']): Entity {
  return { id: `${kind}-${x}-${y}`, pos: { x, y }, kind, data };
}

export function key(p: Vec2): string {
  return `${p.x},${p.y}`;
}
