import type { DisplayState } from '../engine/displayLayer';
import type { WinOverlay } from '../levels/types';

// HUD：DOM 层，只消费 DisplayState。血条/提示可能在撒谎；角落签名/诚实灯是真线索通道。
export class Hud {
  private bloodFill = el('bloodFill');
  private bloodLabel = el('bloodLabel');
  private score = el('score');
  private prompt = el('prompt');
  private narrator = el('narrator');
  private cornerSig = el('cornerSig');
  private honestDot = el('honestDot');
  private overlay = el('overlay');
  private stage = el('stage');
  private chapter = el('chapter');

  // 顶部常驻的章节进度（推进感，不藏起来）
  setChapter(html: string): void {
    this.chapter.innerHTML = html;
  }

  update(d: DisplayState): void {
    this.bloodFill.style.width = `${Math.round(clamp01(d.bloodBarFill) * 100)}%`;
    this.bloodLabel.textContent = d.bloodLabel;
    this.score.textContent = d.scoreText;
    this.prompt.textContent = d.promptText;
    this.narrator.textContent = d.narratorLine;
    this.cornerSig.textContent = d.cornerSignature;
    this.cornerSig.style.opacity = String(d.cornerOpacity);
    this.cornerSig.style.transform = `scale(${d.cornerScale})`;
    this.cornerSig.style.textShadow =
      d.cornerOpacity > 0.5 ? '0 0 10px #28e0d0aa' : 'none';
    // 诚实灯（truthSignal）：透明度跟随真实危险程度；闪烁=规则即将漂移的预警
    this.honestDot.style.opacity = String(0.25 + 0.75 * clamp01(d.honestLight));
    this.honestDot.classList.toggle('blink', d.honestBlink);
    // 受击抖动
    if (d.view.player.shake > 0) this.stage.classList.add('shake');
    else this.stage.classList.remove('shake');
  }

  showOverlay(o: WinOverlay, onContinue: () => void, statLine?: string): void {
    this.overlay.className = o.kind === 'plain' ? 'plain' : '';
    this.overlay.innerHTML = '';
    this.overlay.append(div('big', o.big), div('elegy', o.elegy), div('sub', o.sub));
    if (statLine) this.overlay.append(div('statline', statLine));
    this.overlay.append(div('hint', o.hint));
    const handler = () => {
      window.removeEventListener('keydown', handler);
      this.overlay.removeEventListener('click', handler);
      this.hideOverlay();
      onContinue();
    };
    // 延迟一帧再挂，避免胜利那次按键直接触发继续
    setTimeout(() => {
      window.addEventListener('keydown', handler);
      this.overlay.addEventListener('click', handler);
    }, 60);
  }

  hideOverlay(): void {
    this.overlay.classList.add('hidden');
  }

  // 真结局：界面坦白 + 一张可一键复制去发社媒的战绩卡（含"双截图梗"）
  showAchievement(d: Achievement, opts: AchOpts): void {
    const headline = opts.truthMode ? '連真相，你也信ㄌ。' : '我不騙你了。';
    const elegy = opts.truthMode
      ? '剛剛那個「真相視角」，也是我給你看的。'
      : '血條、提示、那扇門……都是我編的。';
    const slogan = opts.truthMode
      ? '「在它的世界裡，連『真相』都要打個問號。」'
      : '「這遊戲讓我主動求死才通關。你敢信你的血條嗎?」';
    const truthBtn = opts.onTruth
      ? '<button class="ach-btn ghost" id="achTruth">真相視角重玩</button>'
      : '';
    this.overlay.className = 'plain';
    this.overlay.innerHTML = `
      <div class="big">${headline}</div>
      <div class="elegy">${elegy}</div>
      <div class="ach">
        <div class="ach-title">通 關 戰 績</div>
        <div class="ach-rank">${d.rank}</div>
        <div class="ach-grid">
          <div class="ach-cell"><div class="ach-num">${d.layers}</div><div class="ach-lab">識破謊言層數</div></div>
          <div class="ach-cell"><div class="ach-num">${d.fails}</div><div class="ach-lab">被騙次數</div></div>
          <div class="ach-cell"><div class="ach-num">${d.time}</div><div class="ach-lab">用時</div></div>
        </div>
        <div class="ach-meme">
          <div class="meme-col"><div class="meme-cap">你以為の血條</div><div class="meme-bar"><i style="width:100%"></i></div></div>
          <div class="meme-vs">≠</div>
          <div class="meme-col"><div class="meme-cap">真實</div><div class="meme-bar real"><i style="width:9%"></i></div></div>
        </div>
        <div class="ach-slogan">${slogan}</div>
        <div class="ach-btns">
          <button class="ach-btn" id="achCopy">複製戰績去曬</button>
          ${truthBtn}
          <button class="ach-btn ghost" id="achReplay">再玩一次</button>
        </div>
        <textarea class="ach-share" id="achShare" readonly>${d.share}</textarea>
      </div>`;
    this.overlay.classList.remove('hidden');
    const copy = this.overlay.querySelector('#achCopy') as HTMLButtonElement;
    const shareBox = this.overlay.querySelector('#achShare') as HTMLTextAreaElement;
    copy.addEventListener('click', async () => {
      if (await copyText(d.share, shareBox)) {
        copy.textContent = '已複製！去發吧 ✦';
      } else {
        shareBox.classList.add('show');
        shareBox.focus();
        shareBox.select();
        copy.textContent = '↓ 長按/選取下方文字複製';
      }
    });
    (this.overlay.querySelector('#achReplay') as HTMLButtonElement).addEventListener('click', () => {
      this.hideOverlay();
      opts.onReplay();
    });
    if (opts.onTruth) {
      (this.overlay.querySelector('#achTruth') as HTMLButtonElement).addEventListener('click', () => {
        this.hideOverlay();
        opts.onTruth?.();
      });
    }
  }
}

export interface Achievement {
  rank: string;
  fails: number;
  time: string;
  layers: number;
  share: string;
}

export interface AchOpts {
  onReplay: () => void;
  onTruth?: () => void;
  truthMode?: boolean;
}

// 多层兜底的复制：clipboard API → execCommand → 失败交给调用方显文本
async function copyText(text: string, fallbackBox: HTMLTextAreaElement): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* 继续兜底 */
  }
  try {
    fallbackBox.classList.add('show');
    fallbackBox.focus();
    fallbackBox.select();
    const ok = document.execCommand('copy');
    if (ok) fallbackBox.classList.remove('show');
    return ok;
  } catch {
    return false;
  }
}

function el(id: string): HTMLElement {
  const e = document.getElementById(id);
  if (!e) throw new Error(`missing #${id}`);
  return e;
}

function div(cls: string, text: string): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  d.textContent = text;
  return d;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
