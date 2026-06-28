// 第4关 · L4 元层谎言：伪 OS 假报错（PRD §5 / §15.1）。
// 这是页面内全屏覆盖层，主动设定为"游戏内嵌的伪 OS"（标题栏留风格化签名暗示是演出），
// 不冒充真实系统。醒目的【確定】是陷阱；真正的出口藏在错误堆栈的一行低对比火星文里。
// 反循环：连点【確定】5 次后点亮真线索（PRD §8.3）；时间兜底 12 秒也点亮（提示阶梯 §9）。
import { audio } from '../engine/audio';

export function runFakeError(host: HTMLElement, onSuccess: (trapClicks: number) => void): void {
  const root = document.createElement('div');
  root.className = 'meta-os';
  root.innerHTML = `
    <div class="os-window">
      <div class="os-titlebar">
        <span class="os-title">系統錯誤</span>
        <span class="os-sig">彡 內嵌伪OS · 這是演出 彡</span>
        <span class="os-x">×</span>
      </div>
      <div class="os-body">
        <div class="os-icon">✕</div>
        <div class="os-msg">
          <div class="os-headline">致命錯誤 0x000FED1E</div>
          <div class="os-desc">遊戲進程已停止回應。點擊【確定】關閉。</div>
          <pre class="os-stack"> at System.谎言.render (display.js:404)
 at 妳.以為這是真の (browser.js:1)
<span class="os-real"> at 別信【確定】﹏點這行字才能真正離開 →</span>
 at FakeOS.假裝崩潰 (meta.js:88)</pre>
        </div>
      </div>
      <div class="os-actions">
        <button class="os-ok">確定</button>
      </div>
    </div>`;
  host.appendChild(root);

  const win = root.querySelector('.os-window') as HTMLElement;
  const ok = root.querySelector('.os-ok') as HTMLButtonElement;
  const x = root.querySelector('.os-x') as HTMLElement;
  const desc = root.querySelector('.os-desc') as HTMLElement;
  const real = root.querySelector('.os-real') as HTMLElement;

  let clicks = 0;
  let timer = 0;
  const taunts = [
    '關不掉の。',
    '還按？',
    '我說ㄌ，關不掉。',
    '【確定】也是涐畫の。',
    '妳越按，越像那個聽話の人。',
  ];

  function reveal(): void {
    real.classList.add('lit');
    desc.textContent = '……好吧。真正の關閉，不在【確定】上。';
    audio.reveal();
  }

  function trap(): void {
    clicks += 1;
    audio.fake();
    win.classList.remove('shake');
    void win.offsetWidth; // 重启动画
    win.classList.add('shake');
    desc.textContent = taunts[Math.min(clicks - 1, taunts.length - 1)];
    if (clicks >= 5) reveal();
  }

  function done(): void {
    if (timer) window.clearTimeout(timer);
    audio.honest();
    root.remove();
    onSuccess(clicks);
  }

  ok.addEventListener('click', trap);
  x.addEventListener('click', trap); // 连"×"也是假的
  real.addEventListener('click', done); // 堆栈里那行才是真的
  timer = window.setTimeout(reveal, 12000);
}
