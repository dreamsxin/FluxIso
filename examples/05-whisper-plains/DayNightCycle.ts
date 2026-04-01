/**
 * DayNightCycle — 日夜交替系统
 *
 * phase 0 → 1 = 一个完整周期
 *   0.0  = 日出
 *   0.25 = 正午
 *   0.5  = 日落
 *   0.75 = 午夜
 *
 * 太阳从左（日出）弧形运动到右（日落），月亮反向。
 */

export interface DayPhaseColors {
  skyTop: string;
  skyBottom: string;
  celestialColor: string;
  celestialGlowColor: string;
  celestialGlowAlpha: number;
  celestialX: number;   // 0–1 屏幕比例
  celestialY: number;   // 0–1 屏幕比例
  celestialRadius: number; // px
  nightOverlay: number; // 0=白天 1=午夜
  showStars: boolean;
  starAlpha: number;
}

export class DayNightCycle {
  readonly period: number; // 秒

  private _phase = 0; // 0=日出 0.25=正午 0.5=日落 0.75=午夜

  constructor(period = 60) {
    this.period = period;
  }

  update(dt: number): void {
    this._phase = (this._phase + dt / this.period) % 1;
  }

  get phase(): number { return this._phase; }

  setPhase(p: number): void {
    this._phase = ((p % 1) + 1) % 1;
  }

  // ── 夜晚程度 0=白天 1=午夜 ────────────────────────────────────────────────
  // phase 0=日出(0.5夜) → 0.25=正午(0夜) → 0.5=日落(0.5夜) → 0.75=午夜(1夜)
  get nightness(): number {
    // cos 曲线：phase=0.25 → cos(0)=1 → nightness=0（正午最亮）
    //           phase=0.75 → cos(π)=-1 → nightness=1（午夜最暗）
    return (1 - Math.cos((this._phase - 0.25) * Math.PI * 2)) / 2;
  }

  getColors(): DayPhaseColors {
    const p = this._phase;
    const n = this.nightness; // 0=白天 1=夜晚

    // ── 天空颜色 ──────────────────────────────────────────────────────────
    // 黄昏/黎明峰值：phase 接近 0 或 0.5 时
    const dusk = Math.max(0, 1 - Math.min(
      Math.abs(p - 0.0) * 8,
      Math.abs(p - 0.5) * 8,
      Math.abs(p - 1.0) * 8,
    ));

    const skyTop    = this._skyTop(n, dusk);
    const skyBottom = this._skyBottom(n, dusk);

    // ── 天体位置 ──────────────────────────────────────────────────────────
    // 太阳：phase 0(日出左) → 0.25(正午中) → 0.5(日落右)，弧形
    // 月亮：phase 0.5(月出右) → 0.75(午夜中) → 1.0(月落左)，弧形
    const isSun = p < 0.5;

    let celestialX: number, celestialY: number;
    if (isSun) {
      // 东升西落：从右(日出) → 中(正午) → 左(日落)
      const t = p / 0.5; // 0=日出 1=日落
      celestialX = 0.9 - t * 0.8;                        // 0.9 → 0.1
      celestialY = 0.35 - Math.sin(t * Math.PI) * 0.28;  // 弧形，正午最高
    } else {
      // 月亮也是东升西落：从右(月出) → 中(午夜) → 左(月落)
      const t = (p - 0.5) / 0.5; // 0=月出 1=月落
      celestialX = 0.9 - t * 0.8;                        // 0.9 → 0.1
      celestialY = 0.35 - Math.sin(t * Math.PI) * 0.22;
    }

    const celestialColor      = isSun ? '#fffde0' : '#dde8ff';
    const celestialGlowColor  = isSun ? '#ffcc44' : '#8ab4ff';
    const celestialGlowAlpha  = isSun ? (1 - n) * 0.7 : n * 0.5;
    const celestialRadius     = isSun ? 20 : 13;

    // ── 夜晚遮罩 ──────────────────────────────────────────────────────────
    const nightOverlay = n;
    const showStars    = n > 0.1;
    const starAlpha    = Math.min(1, (n - 0.1) / 0.4);

    return {
      skyTop, skyBottom,
      celestialColor, celestialGlowColor, celestialGlowAlpha,
      celestialX, celestialY, celestialRadius,
      nightOverlay, showStars, starAlpha,
    };
  }

  getDirLightParams(): { color: string; intensity: number; angle: number; elevation: number } {
    const n = this.nightness;
    const p = this._phase;

    // 强度：正午最强，午夜最弱
    const intensity = this._lerp(1.3, 0.12, n);

    // 颜色：白天暖白 → 黄昏橙红 → 夜晚冷蓝
    const dusk = Math.max(0, 1 - Math.min(
      Math.abs(p - 0.0) * 6,
      Math.abs(p - 0.5) * 6,
      Math.abs(p - 1.0) * 6,
    ));
    const r = Math.round(this._lerp(255, 80,  n) + dusk * 40);
    const g = Math.round(this._lerp(248, 110, n) - dusk * 30);
    const b = Math.round(this._lerp(220, 200, n) - dusk * 60);
    const color = `rgb(${clamp(r)},${clamp(g)},${clamp(b)})`;

    // 太阳角度：随 phase 从东到西旋转（0°=东，180°=西）
    const angle = 90 + p * 360 * 0.5; // 缓慢绕一圈

    // 仰角：正午高(60°)，日出/日落低(10°)，夜晚极低(5°)
    const sunArc = Math.sin(p * Math.PI * 2); // 正午最高
    const elevation = this._lerp(5, 60, Math.max(0, sunArc));

    return { color, intensity, angle, elevation };
  }

  getAmbientParams(): { color: string; intensity: number } {
    const n = this.nightness;
    const r = Math.round(this._lerp(255, 40,  n));
    const g = Math.round(this._lerp(220, 60,  n));
    const b = Math.round(this._lerp(140, 180, n));
    return {
      color:     `rgb(${clamp(r)},${clamp(g)},${clamp(b)})`,
      intensity: this._lerp(0.72, 0.12, n),
    };
  }

  // ── 私有 ──────────────────────────────────────────────────────────────────

  private _lerp(a: number, b: number, t: number): number {
    return a + (b - a) * Math.max(0, Math.min(1, t));
  }

  private _skyTop(n: number, dusk: number): string {
    // 白天：鲜艳天蓝，夜晚：深蓝，黄昏：橙紫
    const r = Math.round(this._lerp(48,  4,   n) + dusk * 110);
    const g = Math.round(this._lerp(168, 8,   n) - dusk * 40);
    const b = Math.round(this._lerp(230, 22,  n) - dusk * 60);
    return `rgb(${clamp(r)},${clamp(g)},${clamp(b)})`;
  }

  private _skyBottom(n: number, dusk: number): string {
    // 白天：浅蓝偏绿（地平线），夜晚：深蓝，黄昏：橙红
    const r = Math.round(this._lerp(160, 14,  n) + dusk * 160);
    const g = Math.round(this._lerp(220, 25,  n) + dusk * 20);
    const b = Math.round(this._lerp(255, 90,  n) - dusk * 60);
    return `rgb(${clamp(r)},${clamp(g)},${clamp(b)})`;
  }
}

function clamp(v: number): number {
  return Math.max(0, Math.min(255, v));
}
