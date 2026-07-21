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
   */
  render(world, player, opts = {}) {
    this.board.innerHTML = '';
    const nearVis = world.nearVisibleSet(player.col);
    const farVis = world.farVisibleSet(player.col);

    this.board.appendChild(this._buildRow('far', world.far, {
      visible: farVis,
      observed: true,
      enter: opts.enterFar,
      label: t('board.far', { n: world.farFloor }),
    }));
    this.board.appendChild(this._buildRow('near', world.near, {
      visible: nearVis,
      clickable: true,
      label: t('board.near', { n: world.nearFloor }),
    }));
    this.board.appendChild(this._buildPlayerRow(world, player));
  }

  _buildRow(rowKey, cards, { visible, observed, clickable, enter, label }) {
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
      el.dataset.cardId = card.id;   // FLIP 动画按牌追踪位置（牌背也追踪）
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
      ${card.isEnemy && card.data.level ? `<span class="card-corner">Lv.${card.data.level}</span>` : ''}
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
    el.style.zIndex = 20;   // 高于同行右侧的牌（DOM 序在后），避免穿到牌下面
    void el.offsetWidth;   // 强制 reflow，保证过渡生效
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
    el.style.zIndex = 20;
    const target = this._cardEl('near', toCol);
    if (target) target.style.transition = 'opacity 0.3s ease 0.15s';
    // 横移后玩家牌是刚重渲染的新元素：必须先强制 reflow，
    // 否则 transition 不生效，向上移动会变成瞬移
    void el.offsetWidth;
    el.style.transform = `translate(${dx}px, ${dy}px) scale(1.06)`;
    if (target) target.style.opacity = '0.25';   // 目标格淡出（被玩家覆盖）
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

  /**
   * 地图整体向下滚动一行（平滑，非瞬移）。
   * 调用前 world 已滚动：先把新的第二行预插到视野顶部上方，
   * 随整体下滚一起进入 —— 玩家上行后「新行出现」与「移动」连贯呈现。
   */
  async animateScroll(world, player) {
    const newRow = this._buildRow('far', world.far, {
      visible: world.farVisibleSet(player.col),
      observed: true,
      label: t('board.far', { n: world.farFloor }),
    });
    newRow.style.position = 'absolute';
    newRow.style.top = 'calc(-1 * (var(--card-h) + var(--card-gap)))';
    newRow.style.left = '0';
    this.board.prepend(newRow);

    const playerRow = this.board.querySelector('.row-player');
    playerRow?.classList.add('row-exit');
    this.board.classList.add('scrolling');
    this.board.style.transform = `translateY(${this.rowHeight}px)`;
    await wait(560);
    this.board.classList.remove('scrolling');
    this.board.style.transform = '';
  }

  /** 记录每张牌当前的横向位置（FLIP 第一步） */
  capturePositions() {
    const map = new Map();
    this.board.querySelectorAll('.card[data-card-id]').forEach((el) => {
      map.set(el.dataset.cardId, el.getBoundingClientRect().left);
    });
    return map;
  }

  /** 重渲染后按旧位置差值播放滑动动画（FLIP 第二步） */
  animateFlip(oldPos) {
    const cards = this.board.querySelectorAll('.card[data-card-id]');
    cards.forEach((el) => {
      const old = oldPos.get(el.dataset.cardId);
      if (old == null) return;
      const dx = old - el.getBoundingClientRect().left;
      if (Math.abs(dx) < 1) return;
      el.style.transition = 'none';
      el.style.transform = `translateX(${dx}px)`;
    });
    void this.board.offsetHeight;
    cards.forEach((el) => {
      if (!el.style.transform) return;
      el.style.transition = 'transform 0.45s cubic-bezier(0.35, 0.1, 0.25, 1)';
      el.style.transform = '';
    });
  }

  /** 世界演化动画：变化过的格子跳一下 */
  animateDrift(changes) {
    for (const { row, col } of changes) {
      const el = this._cardEl(row, col);
      el?.classList.add('drift-move');
    }
  }
}
