import './style.css';
import { Game } from './engine/game';
import { CanvasRenderer } from './render/canvasRenderer';
import { Hud } from './render/hud';
import type { LevelConfig } from './levels/types';
import { prologue } from './levels/prologue';
import { level1 } from './levels/level1';
import { level2 } from './levels/level2';
import { level3 } from './levels/level3';
import { level5 } from './levels/level5';
import { runFakeError } from './meta/fakeError';
import { runFakeSettlement } from './meta/fakeSettlement';
import { openSettings } from './meta/settings';
import { markCleared } from './meta/save';
import { audio } from './engine/audio';
import { telemetry } from './engine/telemetry';
import { setTruthMode, isTruthMode } from './engine/displayLayer';

const LEVELS: Record<string, LevelConfig> = {
  prologue,
  level1,
  level2,
  level3,
  level5,
};

const canvas = document.getElementById('game') as HTMLCanvasElement;
const stage = document.getElementById('stage') as HTMLElement;
const renderer = new CanvasRenderer(canvas);
const hud = new Hud();

let game: Game;
let overlayUp = false;

// 章节进度（常驻顶部，给推进感）
const CHAPTERS = [
  { id: 'prologue', name: '序章' },
  { id: 'level1', name: '第一關' },
  { id: 'level2', name: '第二關' },
  { id: 'level3', name: '第三關' },
  { id: 'metaL4', name: '第四關' },
  { id: 'level5', name: '第五關' },
];
const TOTAL_LEVELS = CHAPTERS.length - 1; // 序章不计入关数 → 正式关共 5 關
function setChapter(id: string): void {
  const cid = id === 'metaSettlement' ? 'level5' : id; // 假结算属于第五关
  const i = CHAPTERS.findIndex((c) => c.id === cid);
  if (i < 0) {
    // 真结局：5 关全亮
    hud.setChapter(`真結局 <b>${'●'.repeat(TOTAL_LEVELS)}</b> ${TOTAL_LEVELS}/${TOTAL_LEVELS}`);
    return;
  }
  // 序章为第 0 阶段；正式关 i=1..5 即第 i 關，点亮 i 个圆点
  const dots = Array.from({ length: TOTAL_LEVELS }, (_, k) => (k < i ? '●' : '○')).join('');
  const counter = i === 0 ? `共 ${TOTAL_LEVELS} 關` : `${i}/${TOTAL_LEVELS}`;
  hud.setChapter(`${CHAPTERS[i].name} <b>${dots}</b> ${counter}`);
}

// 一周目战绩
interface RunStats {
  start: number;
  fails: number;
}
let stats: RunStats = { start: performance.now(), fails: 0 };
function resetRun(): void {
  stats = { start: performance.now(), fails: 0 };
}
function fmtTime(ms: number): string {
  const s = Math.round(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}分${s % 60}秒` : `${s}秒`;
}
function rankFor(fails: number): string {
  if (fails === 0) return '先知 · 一眼看穿';
  if (fails <= 3) return '清醒者';
  if (fails <= 8) return '半信半疑';
  return '乖﹏聽話の人';
}

function loadScene(id: string): void {
  setChapter(id);
  // 元层场景不走网格引擎（PRD §15.1）
  if (id === 'metaL4') {
    runMetaL4();
    return;
  }
  if (id === 'metaSettlement') {
    runMetaSettlement();
    return;
  }
  const cfg = LEVELS[id];
  if (!cfg) {
    showEnding();
    return;
  }
  telemetry.levelEnter(id);
  game = new Game(cfg);
  if (import.meta.env.DEV) (window as { __game?: Game }).__game = game; // 仅开发期调试句柄
  game.onWin = (overlay) => {
    const fails = game.real.failCount;
    stats.fails += fails;
    const sec = telemetry.levelClear(id, fails);
    // 第5关：到达"金色终点"即落入假结算，不显示通关卡，直接进下一场景
    if (cfg.directNext) {
      loadScene(cfg.next ?? '__ending__');
      return;
    }
    overlayUp = true;
    const base = fails === 0 ? '一次識破！沒上當 ✦' : `本關被騙 ${fails} 次`;
    const statLine = `${base} · ${sec} 秒`;
    hud.showOverlay(
      overlay,
      () => {
        overlayUp = false;
        loadScene(cfg.next ?? '__ending__');
      },
      statLine,
    );
  };
}

// L4：冻结网格、伪 OS 接管交互；成功后进入第5关。
function runMetaL4(): void {
  overlayUp = true; // 暂停网格 tick 与键盘输入
  runFakeError(stage, (trapClicks) => {
    stats.fails += trapClicks;
    overlayUp = false;
    loadScene('level5');
  });
}

// L5 climax：假胜利结算。拒绝它才是真通关 → 真结局。
function runMetaSettlement(): void {
  overlayUp = true;
  runFakeSettlement(stage, (trapClicks) => {
    stats.fails += trapClicks;
    overlayUp = false;
    showEnding();
  });
}

// 页面标题 / favicon（PRD §7.7 安全档）：平时是"在演"的荧光色，真通关后灰掉，标题坦白。
const TITLE_LIE = '这游戏在骗你';
const TITLE_TRUTH = '已關閉 · 謝謝你看穿我';
function setFavicon(color: string): void {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="13" fill="${color}"/></svg>`;
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// 真结局：界面停止撒谎，切到极简素颜（PRD §13）+ 可分享战绩卡（PRD §16）
function showEnding(): void {
  overlayUp = true;
  setChapter('__ending__');
  markCleared();
  document.title = TITLE_TRUTH;
  setFavicon('#888888');
  const truth = isTruthMode();
  const time = fmtTime(performance.now() - stats.start);
  const rank = rankFor(stats.fails);
  const share =
    `我識破ㄌ《這遊戲在騙你》的 5 層謊言，被騙 ${stats.fails} 次，用時 ${time}，稱號【${rank}】。\n` +
    `它讓我主動「求死」才能通關——你敢信你眼前的血條嗎? #這遊戲在騙你`;
  const restart = (truthOn: boolean) => () => {
    overlayUp = false;
    document.title = TITLE_LIE;
    setFavicon('#ff2ec4');
    setTruthMode(truthOn);
    resetRun();
    telemetry.reset();
    loadScene('prologue');
  };
  hud.showAchievement(
    { rank, fails: stats.fails, time, layers: 5, share },
    {
      onReplay: restart(false),
      onTruth: truth ? undefined : restart(true), // 已通关才解锁真相视角；真相视角里不再套娃
      truthMode: truth,
    },
  );
}

// 输入：统一用 event.code（PRD §11.4）。覆盖层弹出时不喂给游戏。
const GAME_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'Space',
  'KeyJ',
  'Enter',
]);

window.addEventListener(
  'keydown',
  (e) => {
    audio.resume(); // 首个手势解锁音频
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (overlayUp) return;
    game.handleInput(e.code);
  },
  { passive: false },
);
window.addEventListener('pointerdown', () => audio.resume(), { passive: true });

// 设置按钮：点开是个会撒谎的假设置面板（PRD §5）。打开时暂停网格。
const gear = document.getElementById('gear') as HTMLButtonElement;
let settingsOpen = false;
gear.addEventListener('click', () => {
  audio.resume();
  if (settingsOpen || overlayUp) return; // 元层场景时不开设置
  settingsOpen = true;
  overlayUp = true;
  openSettings(stage, () => {
    settingsOpen = false;
    overlayUp = false;
  });
});

// 主循环：逻辑 tick + 渲染。
function frame(): void {
  if (!overlayUp) game.tick(1);
  const d = game.getDisplay();
  hud.update(d);
  renderer.draw(d);
  requestAnimationFrame(frame);
}

if (import.meta.env.DEV) (window as { __telemetry?: typeof telemetry }).__telemetry = telemetry;

setFavicon('#ff2ec4');
loadScene('prologue');
requestAnimationFrame(frame);
