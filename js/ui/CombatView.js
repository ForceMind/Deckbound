import { wait } from '../anim/Animator.js';
import { t } from '../core/I18n.js';
import { sound } from '../core/Sound.js';

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
      <div class="combat-stage">
        <div class="combatant" id="cb-player">
          <span class="fighter-emoji">${player.playerClass?.emoji ?? '🧑'}</span>
          <div class="fighter-name">${t('combat.you')}${result.crit ? t('combat.crit') : ''}</div>
          <div class="fighter-power" id="cb-player-power">0</div>
        </div>
        <div class="combat-vs">${t('combat.vs')}</div>
        <div class="combatant" id="cb-monster">
          <span class="fighter-emoji">${card.emoji}</span>
          <div class="fighter-name">${card.name}</div>
          <div class="fighter-power" id="cb-monster-power">0</div>
        </div>
      </div>
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
      this.animator.floatNum(playerEl, t('combat.powerGain', { n: result.powerGain }), 'pow');
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
