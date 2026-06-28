import type { DisplayState } from '../engine/displayLayer';

// 渲染层：只消费 DisplayState（PRD §15.6）。碰不到 RealState/Game（eslint 拦截）。
export class CanvasRenderer {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    this.ctx = ctx;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  // 处理 devicePixelRatio，避免高分屏模糊 / 点击偏移（PRD §15.2）
  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
  }

  draw(d: DisplayState): void {
    const ctx = this.ctx;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    ctx.clearRect(0, 0, cw, ch);

    const cols = d.grid.w;
    const rows = d.grid.h;
    const cell = Math.min(cw / cols, ch / rows);
    const offX = (cw - cell * cols) / 2;
    const offY = (ch - cell * rows) / 2;

    // 背景网格
    ctx.fillStyle = '#0c0614';
    ctx.fillRect(offX, offY, cell * cols, cell * rows);
    ctx.strokeStyle = '#1b0f29';
    ctx.lineWidth = 1;
    for (let x = 0; x <= cols; x++) {
      line(ctx, offX + x * cell, offY, offX + x * cell, offY + rows * cell);
    }
    for (let y = 0; y <= rows; y++) {
      line(ctx, offX, offY + y * cell, offX + cols * cell, offY + y * cell);
    }

    // 砖块
    for (const t of d.view.tiles) {
      const px = offX + t.pos.x * cell;
      const py = offY + t.pos.y * cell;
      const pad = cell * 0.08;
      if (t.glow !== 'transparent') {
        ctx.shadowColor = t.glow;
        ctx.shadowBlur = cell * 0.4;
      }
      ctx.fillStyle = t.fill;
      roundRect(ctx, px + pad, py + pad, cell - pad * 2, cell - pad * 2, cell * 0.12);
      ctx.fill();
      ctx.shadowBlur = 0;
      if (t.label) {
        ctx.fillStyle = '#ffffff';
        ctx.font = `${Math.floor(cell * 0.42)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(t.label, px + cell / 2, py + cell / 2);
      }
    }

    // 玩家（颜色 = 真实状态的诚实通道；shake = 受击抖动）
    const p = d.view.player;
    const jitter =
      p.shake > 0 ? ((hashJitter(p.shake) - 0.5) * cell * 0.18) : 0;
    const cx = offX + p.pos.x * cell + cell / 2 + jitter;
    const cy = offY + p.pos.y * cell + cell / 2;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = cell * 0.5;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(cx, cy, cell * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // 飘过的签名（真按键藏在其中之一）
    ctx.font = `${Math.floor(cell * 0.36)}px "PingFang SC", system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (const f of d.floats) {
      ctx.globalAlpha = Math.max(0, Math.min(1, f.opacity));
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, offX + f.xFrac * cell * cols, offY + f.y * cell + cell / 2);
    }
    ctx.globalAlpha = 1;
  }
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 由 shake 余量派生的伪随机抖动（不依赖 Math.random，保持确定性风格）
function hashJitter(seed: number): number {
  const t = Math.sin(seed * 12.9898) * 43758.5453;
  return t - Math.floor(t);
}
