import { bus } from '../core/EventBus.js';

/**
 * 演出舞台 —— 利用牌阵周围的留白（尤其是竖屏上方大片空间）：
 * - 背景：牌背缓缓上浮的氛围动画
 * - 章节徽章：当前章节 emoji 与名称（移动端显示）
 * - 事件爆点：拾取金币 / 战力提升 / 受伤时弹出大图标反馈
 */
export class StageView {
  constructor() {
    this.el = document.getElementById('stage');
    this.floaters = this.el?.querySelector('.stage-floaters');
    this.chapterEl = this.el?.querySelector('.stage-chapter');
    this.burstsEl = this.el?.querySelector('.stage-bursts');
    this._initFloaters();

    bus.on('goldGained', (n) => this.burst('💰', `+${n}`, 'gold'));
    bus.on('powerGained', (n) => this.burst('💪', `+${n}`, 'pow'));
    bus.on('playerHurt', (n) => this.burst('💥', `-${n}`, 'dmg'));
  }

  /** 背景漂浮牌背（随机大小/位置/速度，无限循环） */
  _initFloaters() {
    if (!this.floaters) return;
    for (let i = 0; i < 6; i++) {
      const card = document.createElement('div');
      card.className = 'stage-float';
      card.textContent = '🂠';
      card.style.left = `${8 + Math.random() * 84}%`;
      card.style.fontSize = `${18 + Math.random() * 22}px`;
      card.style.animationDuration = `${14 + Math.random() * 14}s`;
      card.style.animationDelay = `${-Math.random() * 20}s`;
      this.floaters.appendChild(card);
    }
  }

  /** 更新章节徽章 */
  setChapter(emoji, name) {
    if (!this.chapterEl) return;
    this.chapterEl.innerHTML = `<span class="stage-chapter-emoji">${emoji ?? '🂠'}</span><span class="stage-chapter-name">${name ?? ''}</span>`;
  }

  /** 中央弹出事件反馈（图标 + 数值） */
  burst(emoji, text, cls = '') {
    if (!this.burstsEl) return;
    const el = document.createElement('div');
    el.className = `stage-burst ${cls}`;
    el.innerHTML = `<span class="burst-emoji">${emoji}</span><span class="burst-text">${text}</span>`;
    el.style.setProperty('--burst-x', `${(Math.random() - 0.5) * 90}px`);
    this.burstsEl.appendChild(el);
    while (this.burstsEl.children.length > 4) this.burstsEl.firstChild.remove();
    setTimeout(() => el.remove(), 1500);
  }
}
