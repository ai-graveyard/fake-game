// 程序化音效（WebAudio，无外部素材）。PRD §8 "真/假两套"：
// 假事件用甜腻/廉价音色（三角波大三和弦），真事件(truthSignal/坦白)用干净纯正弦。
// 浏览器自动播放策略：需用户手势后 resume()。
class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;

  private ensure(): void {
    if (this.ctx) return;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.16;
    this.master.connect(this.ctx.destination);
  }

  // 在首个用户手势里调用，解锁音频
  resume(): void {
    this.ensure();
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  setMuted(m: boolean): void {
    this.muted = m;
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0): void {
    if (this.muted) return;
    this.ensure();
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  // ——假音色（甜腻、廉价）——
  fakePositive(): void {
    [523, 659, 784].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.55, i * 0.05));
  }
  fake(): void {
    this.tone(440, 0.08, 'triangle', 0.4);
  } // 假门/嘲讽的小叮
  click(): void {
    this.tone(300, 0.05, 'square', 0.3);
  }

  // ——真音色（干净纯正弦）——
  honest(): void {
    this.tone(880, 0.22, 'sine', 0.5);
  } // truthSignal
  reveal(): void {
    this.tone(660, 0.12, 'sine', 0.4);
    this.tone(990, 0.16, 'sine', 0.4, 0.08);
  }
  win(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.24, 'sine', 0.5, i * 0.08));
  }

  // ——事件——
  damage(): void {
    this.tone(110, 0.18, 'sawtooth', 0.5);
    this.tone(88, 0.2, 'sawtooth', 0.4, 0.02);
  }
  funeral(): void {
    [392, 330, 262].forEach((f, i) => this.tone(f, 0.5, 'sine', 0.5, i * 0.18)); // 下行挽歌
  }
}

export const audio = new GameAudio();
