import { wait } from '../anim/Animator.js';
import { t } from '../core/I18n.js';
import { sound } from '../core/Sound.js';

/**
 * 对决舞台 HTML —— 冒险战斗与大厅玩法（竞技场/狩猎）共用的骨架。
 * left/right: { emoji, name, power }；opts.ids 生成滚动用的 id（仅冒险战斗需要），
 * opts.stageClass 附加 class（如 'clash'）。
 */
export function combatStage(left, right, opts = {}) {
  const side = (c, id) => `
    <div class="combatant"${opts.ids ? ` id="${id}"` : ''}>
      <span class="fighter-emoji">${c.emoji}</span>
      <div class="fighter-name">${c.name}</div>
      <div class="fighter-power"${opts.ids ? ` id="${id}-power"` : ''}>${c.power}</div>
    </div>`;
  return `
    <div class="combat-stage${opts.stageClass ? ` ${opts.stageClass}` : ''}">
      ${side(left, 'cb-player')}
      <div class="combat-vs">${t('combat.vs')}</div>
      ${side(right, 'cb-monster')}
    </div>`;
}

/**
 * 战斗演出 —— 点击怪物立即开战（无二次确认），全程自动：
 * 双方亮相 → 战力数字滚动 → 碰撞震动 → Victory / Defeat。
 * 总时长约 3 秒（config.combat.animMs）。
 */
export class CombatView {
  constructor(modal, animator, config) {
    this.modal = modal;
    this.animator = animator;
    this.animMs = config.combat.animMs;
  }

  /** 快速战斗：设置开启后动画时长缩为 1/3 */
  static get fastMode() {
    return localStorage.getItem('deckbound_fastcombat') === '1';
  }

  static toggleFast() {
    const next = !CombatView.fastMode;
    localStorage.setItem('deckbound_fastcombat', next ? '1' : '0');
    return next;
  }

  async play(player, card, result) {
    sound.play('combat');
    const box = this.modal.showRaw();
    box.classList.add('combat-panel');
    box.innerHTML = `
      <h2>${t('combat.title')}</h2>
      ${combatStage(
        { emoji: player.playerClass?.emoji ?? '🧑', name: `${t('combat.you')}${result.crit ? t('combat.crit') : ''}`, power: 0 },
        { emoji: card.emoji, name: card.name, power: 0 },
        { ids: true },
      )}
      <div class="combat-result" id="cb-result"></div>`;

    const stage = box.querySelector('.combat-stage');
    const phase = (CombatView.fastMode ? this.animMs / 3 : this.animMs) / 3;

    // 阶段1：战力数字滚动
    await Promise.all([
      this._rollNumber(box.querySelector('#cb-player-power'), result.playerPower, phase),
      this._rollNumber(box.querySelector('#cb-monster-power'), result.monsterPower, phase),
    ]);

    // 阶段2：碰撞
    stage.classList.add('clash');
    this.animator.screenShake();
    await wait(phase);
    stage.classList.remove('clash');

    // 阶段3：结果
    const playerEl = box.querySelector('#cb-player');
    const monsterEl = box.querySelector('#cb-monster');
    const resultEl = box.querySelector('#cb-result');
    if (result.win) {
      sound.play('win');
      playerEl.classList.add('winner');
      monsterEl.classList.add('loser');
      resultEl.className = 'combat-result victory';
      resultEl.textContent = t('combat.victory');
      this.animator.floatNum(playerEl, t('combat.expGain', { n: result.expGain }), 'pow');
      this.animator.flyCoins(monsterEl, Math.min(8, Math.max(3, Math.round(result.goldGain / 4))));
    } else {
      sound.play('lose');
      monsterEl.classList.add('winner');
      playerEl.classList.add('loser');
      resultEl.className = 'combat-result defeat';
      resultEl.textContent = t('combat.defeat');
      this.animator.floatNum(playerEl, `-${result.damage}`, 'dmg');
    }
    await wait(phase + (CombatView.fastMode ? 200 : 400));
    this.modal.hide();
  }

  _rollNumber(el, target, duration) {
    return new Promise((resolve) => {
      const start = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - start) / duration);
        el.textContent = Math.round(target * (1 - Math.pow(1 - t, 3)));
        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
  }
}
