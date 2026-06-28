// 第5关climax · L4 元层谎言的镜像：假胜利结算（PRD §5）。
// 前面骗你"坏东西"，这里给你最想要的——胜利。真正的通关是【拒绝】这场假胜利：
// 醒目的【領取勝利】是陷阱（点它=你还是信了它），真出口是角落一行"拒絕这个结局"。
import { audio } from '../engine/audio';

export function runFakeSettlement(host: HTMLElement, onRefuse: (trapClicks: number) => void): void {
  const root = document.createElement('div');
  root.className = 'meta-os settle';
  root.innerHTML = `
    <div class="settle-card">
      <div class="settle-emoji">🎉</div>
      <div class="settle-title">恭喜通關！</div>
      <div class="settle-desc">妳識破ㄌ所有謊言，妳贏ㄌ。點擊【領取勝利】。</div>
      <button class="settle-claim">領取勝利</button>
      <div class="settle-refuse">★彡 連勝利都是假の﹏點這裡拒絕這個結局 彡★</div>
    </div>`;
  host.appendChild(root);

  const card = root.querySelector('.settle-card') as HTMLElement;
  const claim = root.querySelector('.settle-claim') as HTMLButtonElement;
  const refuse = root.querySelector('.settle-refuse') as HTMLElement;
  const desc = root.querySelector('.settle-desc') as HTMLElement;

  let clicks = 0;
  let timer = 0;
  const taunts = [
    '還想要勝利? 妳還是信ㄌ我。',
    '獎勵在路上ㄌ……（並沒有）',
    '妳贏ㄌ嗎? 妳確定?',
    '點再多次也沒有獎勵喲。',
    '妳要的不是真相，是被我誇獎，對吧?',
  ];

  function reveal(): void {
    refuse.classList.add('lit');
    desc.textContent = '……妳真的要「領取」我給妳的勝利嗎?';
    audio.reveal();
  }
  function trap(): void {
    clicks += 1;
    audio.fakePositive(); // 甜腻的假胜利音
    card.classList.remove('shake');
    void card.offsetWidth;
    card.classList.add('shake');
    desc.textContent = taunts[Math.min(clicks - 1, taunts.length - 1)];
    if (clicks >= 4) reveal();
  }
  function done(): void {
    if (timer) window.clearTimeout(timer);
    audio.win(); // 拒绝假胜利 → 干净的真·胜利音
    root.remove();
    onRefuse(clicks);
  }

  claim.addEventListener('click', trap);
  refuse.addEventListener('click', done);
  timer = window.setTimeout(reveal, 12000);
}
