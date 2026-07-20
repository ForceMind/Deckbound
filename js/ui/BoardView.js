import { wait } from '../anim/Animator.js';
import { t } from '../core/I18n.js';

/**
 * 牌阵渲染 —— 三行结构：
 *   row-far    第二行（远，仅正前方 3 张可见，只能观察）
 *   row-near   第一行（近，中间 5 张可见，可点击移动）
 *   row-player 玩家所在行（走过的地面 + 玩家牌）
 * 负责：渲染、移动/滚动/刷新/演化动画。点击事件回调给 Game。
 */
export class BoardView {
  constructor(config) {
    this.config = config;
    this.board = document.getElementById('board');
    this.onCardClick = null;   // (col) => void，由 Game 注入
  }

  get rowHeight() {
    const style = getComputedStyle(document.documentElement);
    const h = parseFloat(style.getPropertyValue('--card-h'));
    const gap = parseFloat(style.getPropertyValue('--card-gap'));
    return h + gap;
  }

  /**
   * 全量渲染。
   * opts.enterFar: 新第二行播放滑入动画
   * opts.reshuffle: 两行播放洗牌动画（Rest）
   */
  render(world, player, opts = {}) {
    this.board.innerHTML = '';
    const nearVis = world.nearVisibleSet(player.col);
    const farVis = world.farVisibleSet(player.col);

    this.board.appendChild(this._buildRow('far', world.far, {
      visible: farVis,
      observed: true,
      enter: opts.enterFar,
      reshuffle: opts.reshuffle,
      label: t('board.far', { n: world.farFloor }),
    }));
    this.board.appendChild(this._buildRow('near', world.near, {
      visible: nearVis,
      clickable: true,
      reshuffle: opts.reshuffle,
      label: t('board.near', { n: world.nearFloor }),
    }));
    this.board.appendChild(this._buildPlayerRow(world, player));
  }

  _buildRow(rowKey, cards, { visible, observed, clickable, enter, reshuffle, label }) {
    const rowEl = document.createElement('div');
    rowEl.className = `board-row row-${rowKey}${enter ? ' row-enter' : ''}`;
    if (label) {
      const lab = document.createElement('span');
      lab.className = 'row-label';
      lab.textContent = label;
      rowEl.appendChild(lab);
    }
    cards.forEach((card, col) => {
      const el = this._buildCard(card, {
        faceUp: visible.has(col),
        observed: observed && visible.has(col),
        clickable: clickable && visible.has(col),
      });
      el.dataset.row = rowKey;
      el.dataset.col = col;
      if (reshuffle) el.classList.add('reshuffle');   // 牌背也播动画：看不见的牌同样在变
      if (clickable && visible.has(col)) {
        el.addEventListener('click', () => this.onCardClick?.(col));
      }
      rowEl.appendChild(el);
    });
    return rowEl;
  }

  _buildPlayerRow(world, player) {
    const rowEl = document.createElement('div');
    rowEl.className = 'board-row row-player';
    const lab = document.createElement('span');
    lab.className = 'row-label';
    lab.textContent = t('board.current', { n: world.floor });
    rowEl.appendChild(lab);

    for (let col = 0; col < world.cols; col++) {
      let el;
      if (col === player.col) {
        el = document.createElement('div');
        el.className = 'card card-player';
        el.id = 'player-card';
        el.innerHTML = `
          <span class="card-emoji">${player.playerClass?.emoji ?? '🧑'}</span>
          <span class="card-name">${player.playerClass?.name ?? '冒险者'}</span>
          <span class="card-power">${player.effectivePower}</span>`;
      } else {
        el = document.createElement('div');
        el.className = 'card card-ground';
      }
      el.dataset.row = 'player';
      el.dataset.col = col;
      rowEl.appendChild(el);
    }
    return rowEl;
  }

  _buildCard(card, { faceUp, observed, clickable }) {
    const el = document.createElement('div');
    if (!faceUp) {
      el.className = 'card card-back';
      return el;
    }
    el.className = `card type-${card.type} rarity-${card.rarity}`;
    if (observed && !clickable) el.classList.add('observed');
    if (clickable) el.classList.add('clickable');
    el.innerHTML = `
      <span class="card-emoji">${card.emoji}</span>
      <span class="card-name">${card.name}</span>
      ${card.isEnemy ? `<span class="card-power">${card.data.mirror ? '?' : card.power}</span>` : ''}
      <span class="card-rarity-gem"></span>`;
    return el;
  }

  _playerEl() {
    return document.getElementById('player-card');
  }

  _cardEl(row, col) {
    return this.board.querySelector(`.card[data-row="${row}"][data-col="${col}"]`);
  }

  /** 横向移动：玩家牌平移到同行目标列 */
  async animateSideStep(fromCol, toCol) {
    const el = this._playerEl();
    if (!el) return;
    const style = getComputedStyle(document.documentElement);
    const w = parseFloat(style.getPropertyValue('--card-w'));
    const gap = parseFloat(style.getPropertyValue('--card-gap'));
    const dx = (toCol - fromCol) * (w + gap);
    el.style.transition = 'transform 0.28s cubic-bezier(0.3, 0, 0.4, 1)';
    el.style.transform = `translateX(${dx}px)`;
    await wait(300);
  }

  /** 前进：玩家牌跳到第一行目标格 */
  async animateAdvance(fromCol, toCol) {
    const el = this._playerEl();
    if (!el) return;
    const style = getComputedStyle(document.documentElement);
    const w = parseFloat(style.getPropertyValue('--card-w'));
    const dx = (toCol - fromCol) * (w + parseFloat(style.getPropertyValue('--card-gap')));
    const dy = -this.rowHeight;
    el.style.transition = 'transform 0.38s cubic-bezier(0.35, -0.15, 0.4, 1.1)';
    el.style.transform = `translate(${dx}px, ${dy}px) scale(1.06)`;
    el.style.zIndex = 20;
    // 目标格淡出（被玩家覆盖）
    const target = this._cardEl('near', toCol);
    if (target) {
      target.style.transition = 'opacity 0.3s ease 0.15s';
      target.style.opacity = '0.25';
    }
    await wait(400);
  }

  /** 战败击退：玩家牌弹回原位 */
  async animateRetreat() {
    const el = this._playerEl();
    if (!el) return;
    el.style.transition = 'transform 0.3s ease';
    el.style.transform = 'translate(0, 0) scale(1)';
    const dimmed = this.board.querySelectorAll('.row-near .card[style*="opacity"]');
    dimmed.forEach((c) => (c.style.opacity = ''));
    await wait(320);
  }

  /** 地图整体向下滚动一行（平滑，非瞬移） */
  async animateScroll() {
    const playerRow = this.board.querySelector('.row-player');
    playerRow?.classList.add('row-exit');
    this.board.classList.add('scrolling');
    this.board.style.transform = `translateY(${this.rowHeight}px)`;
    await wait(560);
    this.board.classList.remove('scrolling');
    this.board.style.transform = '';
  }

  /** 世界演化动画：变化过的格子跳一下 */
  animateDrift(changes) {
    for (const { row, col } of changes) {
      const el = this._cardEl(row, col);
      el?.classList.add('drift-move');
    }
  }
}
