/**
 * DayNightCycle — 日夜交替系统
 *
 * 60 秒一个完整周期（白天 → 黄昏 → 夜晚 → 黎明 → 白天）
 * 驱动：
 *   - DirectionalLight 颜色 / 强度（太阳/月亮）
 *   - OmniLight 环境光颜色 / 强度
 *   - 天空颜色（返回给调用方绘制）
 *   - 太阳/月亮屏幕位置
 *   - 整体夜晚遮罩透明度
 */

export interface DayPhaseColors {
  /** 天空顶部颜色 */
  skyTop: string;
  /** 天空底部颜色（地平线） */
  skyBottom: string;
  /** 太阳/月亮颜色 */
  celestialColor: string;
  /** 太阳/月亮光晕颜色 */
  celestialGlow: string;
  /** 太阳/月亮屏幕位置 0–1 */
  celestialX: number;
  celestialY: number;
  /** 夜晚遮罩透明度 0–1 */
  nightOverlay: number;
  /** 是否显示星星 */
  showStars: boolean;
  /** 星星透明度 */
  starAlpha: number;
}

export class DayNightCycle {
  /** 完整周期秒数，默认 60 */
  readonly period: number;

  /** 当前时间相位 0–1（0=正午，0.5=午夜） */
  private _phase = 0;

  constructor(period = 60) {
    this.period = period;
  }

  /** 推进时间，dt 单位秒 */
  update(dt: number): void {
    this._phase = (this._phase + dt / this.period) % 1;
  }

  /** 当前相位 0–1 */
  get phase(): number { return this._phase; }

  /** 设置初始相位（0=正午，0.25=黄昏，0.5=午夜，0.75=黎明） */
  setPhase(p: number): void { this._phase = ((p % 1) + 1) % 1; }

  /**
   * 返回当前帧的天空/光照参数，供调用方绘制天空和更新灯光。
   */
  getColors(): DayPhaseColors {
    const p = this._phase; // 0=正午 0.5=午夜

    // ── 各阶段关键帧 ──────────────────────────────────────────────────────
    // 正午(0)  → 黄昏(0.25) → 午夜(0.5) → 黎明(0.75) → 正午(1)
    // 用 smoothstep 在关键帧之间插值

    // 夜晚遮罩：0.2~0.8 之间为夜晚
    const nightOverlay = this._nightMask(p);
    const showStars    = nightOverlay > 0.05;
    const starAlpha    = Math.min(1, nightOverlay * 2);

    // 天空颜色插值
    const skyTop    = this._lerpSkyTop(p);
    const skyBottom = this._lerpSkyBottom(p);

    // 天体（太阳/月亮）
    // 太阳在 0~0.5 可见，月亮在 0.4~1 可见
    const isSun = nightOverlay < 0.5;
    const celestialColor = isSun ? '#fffde0' : '#e8f0ff';
    const celestialGlow  = isSun
      ? `rgba(255,240,160,${(1 - nightOverlay) * 0.7})`
      : `rgba(200,220,255,${nightOverlay * 0.5})`;

    // 太阳从左到右弧形运动（p=0 正中，p=0.25 右侧落下）
    // 月亮从右到左（p=0.5 正中，p=0.75 左侧）
    let celestialX: number, celestialY: number;
    if (isSun) {
      const sunT = p * 2; // 0→1 对应正午→黄昏
      celestialX = 0.2 + sunT * 0.6;
      celestialY = 0.05 + Math.sin(sunT * Math.PI) * 0.12;
    } else {
      const moonT = (p - 0.5) * 2; // 0→1 对应午夜→黎明
      celestialX = 0.8 - moonT * 0.6;
      celestialY = 0.05 + Math.sin(moonT * Math.PI) * 0.1;
    }

    return { skyTop, skyBottom, celestialColor, celestialGlow, celestialX, celestialY, nightOverlay, showStars, starAlpha };
  }

  /**
   * 返回方向光参数（太阳光）
   * 白天：暖白色高强度；黄昏：橙红低角度；夜晚：冷蓝极低强度（月光）
   */
  getDirLightParams(): { color: string; intensity: number; angle: number; elevation: number } {
    const p = this._phase;
    const night = this._nightMask(p);

    // 强度：白天 0.9，黄昏 0.5，夜晚 0.15（月光）
    const intensity = this._lerp(0.9, 0.15, night);

    // 颜色：白天暖白 → 黄昏橙红 → 夜晚冷蓝
    const r = Math.round(this._lerp(255, 80,  night));
    const g = Math.round(this._lerp(246, 120, night));
    const b = Math.round(this._lerp(216, 200, night));
    const color = `rgb(${r},${g},${b})`;

    // 太阳角度随时间变化（白天从东到西）
    const angle = 215 + p * 360 * 0.5; // 缓慢旋转

    // 仰角：正午高，黄昏低
    const elevation = this._lerp(52, 15, Math.min(1, night * 2));

    return { color, intensity, angle, elevation };
  }

  /**
   * 返回环境 OmniLight 参数
   */
  getAmbientParams(): { color: string; intensity: number } {
    const night = this._nightMask(this._phase);
    const r = Math.round(this._lerp(255, 60,  night));
    const g = Math.round(this._lerp(216, 80,  night));
    const b = Math.round(this._lerp(136, 180, night));
    return {
      color:     `rgb(${r},${g},${b})`,
      intensity: this._lerp(0.45, 0.15, night),
    };
  }

  // ── 私有辅助 ──────────────────────────────────────────────────────────────

  /** 夜晚遮罩：0=白天，1=午夜 */
  private _nightMask(p: number): number {
    // 正弦曲线：p=0 → 0（白天），p=0.5 → 1（夜晚）
    return Math.max(0, Math.sin(p * Math.PI * 2 - Math.PI / 2) * -0.5 + 0.5);
  }

  private _lerp(a: number, b: number, t: number): number {
    return a + (b - a) * Math.max(0, Math.min(1, t));
  }

  private _lerpSkyTop(p: number): string {
    const night = this._nightMask(p);
    // 白天蓝 → 黄昏橙紫 → 夜晚深蓝
    const dusk = Math.max(0, 1 - Math.abs(night - 0.5) * 4); // 黄昏峰值
    const r = Math.round(this._lerp(74,  4,   night) + dusk * 80);
    const g = Math.round(this._lerp(159, 9,   night) - dusk * 20);
    const b = Math.round(this._lerp(208, 26,  night) - dusk * 40);
    return `rgb(${Math.max(0,Math.min(255,r))},${Math.max(0,Math.min(255,g))},${Math.max(0,Math.min(255,b))})`;
  }

  private _lerpSkyBottom(p: number): string {
    const night = this._nightMask(p);
    const dusk = Math.max(0, 1 - Math.abs(night - 0.5) * 4);
    const r = Math.round(this._lerp(216, 16,  night) + dusk * 120);
    const g = Math.round(this._lerp(240, 30,  night) + dusk * 20);
    const b = Math.round(this._lerp(192, 96,  night) - dusk * 30);
    return `rgb(${Math.max(0,Math.min(255,r))},${Math.max(0,Math.min(255,g))},${Math.max(0,Math.min(255,b))})`;
  }
}
