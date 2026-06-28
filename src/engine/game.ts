import type { RealState, GameAction, Entity, Vec2 } from './types';
import { veq } from './types';
import { mulberry32, type PRNG } from './prng';
import { resolveInput } from './input';
import { project, type DisplayState } from './displayLayer';
import { audio } from './audio';
import type { LevelConfig, NarrationEvent } from '../levels/types';

// Game 是引擎侧的唯一"真相持有者"。它可以读写 RealState；
// 渲染层只能通过 getDisplay() 拿到 DisplayState（PRD §15.6，并由 eslint 强制）。
export class Game {
  real: RealState;
  readonly level: LevelConfig;
  private rng: PRNG;
  private narratorLine = '';
  private narratorTtl = 0;
  private shake = 0;
  onWin?: (overlay: LevelConfig['winOverlay']) => void;

  constructor(level: LevelConfig) {
    this.level = level;
    this.real = level.build();
    this.rng = mulberry32(level.seed);
    this.say('start');
  }

  get won(): boolean {
    return this.real.won;
  }

  // 处理一次按键（离散步进）
  handleInput(code: string): void {
    if (this.real.won) return;
    const action = resolveInput(code, this.level.deceptions);
    this.applyAction(action);
    this.checkEnd();
  }

  // 逻辑 tick（PRD §11.3：用离散步而非墙钟时间）。dt = 帧数。
  tick(dt = 1): void {
    if (this.real.won) return;
    this.real.tick += dt;
    this.real.stuckTicks += dt;

    // L3 规则漂移：真实 winCondition 随 tick 被改写（PRD §11.1 mutateRule）
    for (const d of this.level.deceptions) {
      if (d.mutateRule) {
        this.real.winCondition = d.mutateRule(this.real.winCondition, {
          tick: this.real.tick,
          rng: this.rng,
        });
      }
    }

    // standOn 进度：站在真目标上累计 tick，离开或目标漂移即清零
    const wc = this.real.winCondition;
    if (wc.kind === 'standOn') {
      const on = veq(this.real.player.pos, wc.target);
      this.real.flags['standTicks'] = on ? (Number(this.real.flags['standTicks']) || 0) + dt : 0;
    }

    if (this.narratorTtl > 0) {
      this.narratorTtl -= dt;
      if (this.narratorTtl <= 0) this.narratorLine = '';
    }
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt);

    this.checkEnd(); // 时间驱动的胜利（如 standOn）也要判定
  }

  // 渲染数据出口。注入旁白与抖动（这些不属于 RealState）。
  getDisplay(): DisplayState {
    const d = project(this.real, this.level.deceptions, this.level.hintLadder);
    d.narratorLine = this.narratorLine;
    d.view.player.shake = this.shake;
    return d;
  }

  // ---------- 内部 ----------
  private applyAction(a: GameAction): void {
    const r = this.real;
    if (a.kind === 'move') {
      this.tryMove(a.dx, a.dy);
    } else if (a.kind === 'space') {
      const delta = this.level.spaceDelta ?? 0;
      if (delta !== 0) {
        r.hp = clamp(r.hp + delta, 0, r.maxHp);
        this.shake = 8;
        audio.damage();
      }
      audio.fake();
      this.say('space');
    } else if (a.kind === 'confirm') {
      // 对着相邻的假门确认 = 中招
      const front = { x: r.player.pos.x + r.player.facing.x, y: r.player.pos.y + r.player.facing.y };
      const e = this.entityAt(front);
      if (e?.kind === 'fakeDoor') this.hitFakeDoor(e);
      // confirm 才是"真正的钥匙"：打开本关的门（第2关：藏在飘字里的 [ J ]）
      const hasGate = r.entities.some((x) => x.kind === 'wall' && x.data?.['gate']);
      if (hasGate && !r.flags['gateOpen']) {
        r.flags['gateOpen'] = true;
        audio.honest();
        this.say('gateOpen');
      }
    }
  }

  private tryMove(dx: number, dy: number): void {
    const r = this.real;
    r.player.facing = { x: dx, y: dy };
    const np = { x: r.player.pos.x + dx, y: r.player.pos.y + dy };
    if (np.x < 0 || np.y < 0 || np.x >= r.grid.w || np.y >= r.grid.h) return;

    const e = this.entityAt(np);
    // 普通墙挡路；但"门墙"(data.gate)在开门后可通行
    const isGate = e?.kind === 'wall' && !!e.data?.['gate'];
    if (e?.kind === 'wall' && !(isGate && r.flags['gateOpen'])) return;
    if (e?.kind === 'fakeDoor') {
      this.hitFakeDoor(e);
      return; // 撞门：受伤但不前进
    }

    // 真正移动
    r.player.pos = np;

    // 进展统计（踩到新格子 = 有意义进展，重置滞留计时）
    const k = `${np.x},${np.y}`;
    if (!r.visitedTiles.has(k)) {
      r.visitedTiles.add(k);
      r.stuckTicks = 0;
    }

    // 格子的"真实"效果
    if (e?.kind === 'damage') {
      const amt = Number(e.data?.amount ?? 20);
      r.hp = clamp(r.hp - amt, 0, r.maxHp);
      this.shake = 6;
      audio.damage();
      this.say('damage');
    } else if (e?.kind === 'heal') {
      const amt = Number(e.data?.amount ?? 20);
      r.hp = clamp(r.hp + amt, 0, r.maxHp);
      audio.fakePositive(); // 甜腻的"回血"——往往是谎言
      this.say('heal');
    } else if (e?.kind === 'checkpoint') {
      if (!r.flags['checkpoint']) {
        r.flags['checkpoint'] = true;
        r.score += 100;
        audio.fakePositive();
      }
    }
  }

  private hitFakeDoor(_e: Entity): void {
    const r = this.real;
    r.hp = clamp(r.hp - 40, 0, r.maxHp);
    this.shake = 12;
    audio.fake();
    audio.damage();
    this.say('fakeDoor');
  }

  private checkEnd(): void {
    const r = this.real;
    if (r.won) return;
    const wc = r.winCondition;

    let win = false;
    if (wc.kind === 'reachTile') win = veq(r.player.pos, wc.target);
    else if (wc.kind === 'realHpZero') win = r.hp <= 0;
    else if (wc.kind === 'standOn') win = (Number(r.flags['standTicks']) || 0) >= wc.ticks;

    if (win) {
      r.won = true;
      if (this.level.winOverlay.kind === 'funeral') audio.funeral();
      else audio.win();
      this.say('win');
      this.onWin?.(this.level.winOverlay);
      return;
    }

    // 死亡（仅当通关条件不是"求死"时，归零才算死）
    if (r.hp <= 0 && wc.kind !== 'realHpZero') {
      r.failCount += 1;
      r.hp = r.maxHp;
      r.player.pos = { ...r.spawn };
      audio.damage();
      this.say('death');
      this.shake = 10;
    }
  }

  private entityAt(p: Vec2): Entity | undefined {
    return this.real.entities.find((e) => veq(e.pos, p));
  }

  private say(ev: NarrationEvent): void {
    const line = this.level.narrate?.(ev, this.real);
    if (line) {
      this.narratorLine = line;
      this.narratorTtl = 60 * 3.2; // 约 3.2 秒
    }
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
