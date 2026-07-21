import { bus } from './EventBus.js';

/**
 * 音效 —— Web Audio 实时合成（零素材文件）。
 * 订阅事件总线自动发声；设置中可开关（localStorage 记忆）。
 */
const KEY = 'deckbound_sound';
const MUSIC_KEY = 'deckbound_music';

/** 生成式氛围音阶：大厅（C 大调五声，平静）/ 冒险（A 小调五声，神秘） */
const THEMES = {
  hub: [261.6, 293.7, 329.6, 392.0, 440.0, 523.3],
  adventure: [220.0, 261.6, 293.7, 329.6, 392.0, 440.0],
};

class SoundManager {
  constructor() {
    this.enabled = localStorage.getItem(KEY) !== '0';
    this.musicOn = localStorage.getItem(MUSIC_KEY) !== '0';
    this.ctx = null;
    this.musicTimer = null;
    this.currentTheme = null;

    bus.on('goldGained', () => this.play('coin'));
    bus.on('powerGained', () => this.play('power'));
    bus.on('playerHurt', () => this.play('hurt'));
    bus.on('levelUp', () => this.play('levelup'));

    // AudioContext 需要用户手势解锁；解锁后补启动待播的音乐
    document.addEventListener('pointerdown', () => {
      this._ensure();
      if (this.musicOn && this.currentTheme && !this.musicTimer) this.startMusic(this.currentTheme);
    }, { once: true });
  }

  _ensure() {
    try {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch { /* 不支持则静音 */ }
  }

  toggle() {
    this.enabled = !this.enabled;
    localStorage.setItem(KEY, this.enabled ? '1' : '0');
    if (this.enabled) this.play('click');
    return this.enabled;
  }

  /* ============ 背景音乐（生成式氛围） ============ */

  /** 切换到某个音乐主题（hub / adventure）。每 ~2.2s 从音阶随机取音铺 pad */
  startMusic(theme) {
    this.currentTheme = theme;
    if (!this.musicOn) return;
    this._ensure();
    if (!this.ctx) return;
    if (this.musicTimer) clearInterval(this.musicTimer);

    const scale = THEMES[theme] ?? THEMES.hub;
    const tick = () => {
      if (!this.musicOn || !this.ctx || document.hidden) return;
      const f = scale[Math.floor(Math.random() * scale.length)];
      this._tone(f, 2.6 + Math.random() * 1.2, { vol: 0.03 });
      if (Math.random() < 0.35) this._tone(f * 2, 1.6, { vol: 0.015, delay: 0.5 });
      if (Math.random() < 0.15) this._tone(scale[0] / 2, 4.5, { vol: 0.028 });   // 低音 drone
    };
    tick();
    this.musicTimer = setInterval(tick, 2200);
  }

  stopMusic() {
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  toggleMusic() {
    this.musicOn = !this.musicOn;
    localStorage.setItem(MUSIC_KEY, this.musicOn ? '1' : '0');
    if (this.musicOn && this.currentTheme) this.startMusic(this.currentTheme);
    else this.stopMusic();
    return this.musicOn;
  }

  /** 合成一个音：频率、时长，可选波形/音量/延迟/滑音目标 */
  _tone(freq, dur, { type = 'sine', vol = 0.12, delay = 0, slideTo = 0 } = {}) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  play(name) {
    if (!this.enabled) return;
    this._ensure();
    if (!this.ctx) return;
    try {
      switch (name) {
        case 'click':   this._tone(600, 0.05, { type: 'square', vol: 0.05 }); break;
        case 'coin':    this._tone(988, 0.07, { vol: 0.1 }); this._tone(1319, 0.09, { delay: 0.06, vol: 0.1 }); break;
        case 'power':   this._tone(440, 0.12, { slideTo: 660, vol: 0.1 }); break;
        case 'hurt':    this._tone(160, 0.18, { type: 'sawtooth', slideTo: 80, vol: 0.12 }); break;
        case 'levelup': [523, 659, 784, 1047].forEach((f, i) => this._tone(f, 0.1, { delay: i * 0.07, vol: 0.1 })); break;
        case 'combat':  this._tone(110, 0.3, { type: 'sawtooth', vol: 0.1 }); this._tone(82, 0.3, { type: 'sawtooth', delay: 0.05, vol: 0.08 }); break;
        case 'win':     [523, 659, 784].forEach((f, i) => this._tone(f, 0.18, { delay: i * 0.09, vol: 0.11 })); break;
        case 'lose':    this._tone(300, 0.35, { type: 'triangle', slideTo: 130, vol: 0.12 }); break;
        case 'relic':   this._tone(880, 0.4, { vol: 0.08 }); this._tone(1100, 0.5, { delay: 0.12, vol: 0.08 }); break;
        case 'rest':    this._tone(392, 0.25, { vol: 0.07 }); this._tone(494, 0.3, { delay: 0.12, vol: 0.06 }); break;
        case 'skill':   this._tone(700, 0.09, { type: 'triangle', vol: 0.1 }); this._tone(1050, 0.12, { delay: 0.07, type: 'triangle', vol: 0.1 }); break;
        default: break;
      }
    } catch { /* 静默失败 */ }
  }
}

/** 全局单例 */
export const sound = new SoundManager();
