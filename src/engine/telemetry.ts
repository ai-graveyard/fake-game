// 轻量埋点（PRD §17）：把"识破"操作化为可测代理——记录每关进入/通关时间、
// 被骗次数、提示阶梯到达级别。纯前端，缓存在内存 + localStorage，测试期可导出 CSV。
export interface TelemetryEvent {
  t: number; // ms（performance.now 取整）
  type: string;
  level?: string;
  data?: Record<string, number | string | boolean>;
}

class Telemetry {
  events: TelemetryEvent[] = [];
  private enterT: Record<string, number> = {};

  private now(): number {
    return Math.round(performance.now());
  }

  record(type: string, level?: string, data?: TelemetryEvent['data']): void {
    this.events.push({ t: this.now(), type, level, data });
    this.persist();
  }

  levelEnter(level: string): void {
    this.enterT[level] = this.now();
    this.record('enter', level);
  }

  // 返回本关识破耗时（秒），用于即时反馈
  levelClear(level: string, fails: number): number {
    const ms = this.enterT[level] != null ? this.now() - this.enterT[level] : 0;
    const sec = Math.max(1, Math.round(ms / 1000));
    this.record('clear', level, { fails, solveSec: sec });
    return sec;
  }

  // 每关识破耗时汇总（給结算/调试）
  summary(): { level: string; solveSec: number; fails: number }[] {
    return this.events
      .filter((e) => e.type === 'clear')
      .map((e) => ({
        level: e.level ?? '?',
        solveSec: Number(e.data?.solveSec ?? 0),
        fails: Number(e.data?.fails ?? 0),
      }));
  }

  reset(): void {
    this.events = [];
    this.enterT = {};
  }

  private persist(): void {
    try {
      localStorage.setItem('fakegame_telemetry', JSON.stringify(this.events.slice(-300)));
    } catch {
      /* 隐私模式/配额满则忽略 */
    }
  }
}

export const telemetry = new Telemetry();
