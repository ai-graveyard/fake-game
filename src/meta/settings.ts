import { audio } from '../engine/audio';

// 假设置面板（PRD §5 "假的设置项"）：靜音是真的（诚实功能），
// 音量滑块是假的（拖它只会被嘲讽），語言下拉也是假的。设置本身也在骗你。
export function openSettings(host: HTMLElement, onClose: () => void): void {
  const root = document.createElement('div');
  root.className = 'meta-os settings';
  root.innerHTML = `
    <div class="set-card">
      <div class="set-title">設置</div>
      <label class="set-row">
        <span>靜音</span>
        <input type="checkbox" id="setMute" ${audio.muted ? 'checked' : ''} />
      </label>
      <label class="set-row">
        <span>音量</span>
        <input type="range" id="setVol" min="0" max="100" value="70" />
      </label>
      <label class="set-row">
        <span>語言</span>
        <select id="setLang"><option>简体中文</option><option>火星文</option><option>真話</option></select>
      </label>
      <div class="set-note" id="setNote">　</div>
      <button class="set-close" id="setClose">關閉</button>
    </div>`;
  host.appendChild(root);

  const note = root.querySelector('#setNote') as HTMLElement;
  const mute = root.querySelector('#setMute') as HTMLInputElement;
  const vol = root.querySelector('#setVol') as HTMLInputElement;
  const lang = root.querySelector('#setLang') as HTMLSelectElement;

  mute.addEventListener('change', () => {
    audio.setMuted(mute.checked); // 真的
    note.textContent = mute.checked ? '（靜音是真的。）' : '　';
    if (!mute.checked) audio.click();
  });
  vol.addEventListener('input', () => {
    note.textContent = '這個滑塊其實沒接音量喲～'; // 假的
    audio.fake();
  });
  lang.addEventListener('change', () => {
    note.textContent = lang.value === '真話' ? '真話? 我不會說那個。' : '換ㄌ語言，謊言還是謊言。';
    audio.fake();
  });

  const close = (): void => {
    root.remove();
    onClose();
  };
  (root.querySelector('#setClose') as HTMLButtonElement).addEventListener('click', close);
}
