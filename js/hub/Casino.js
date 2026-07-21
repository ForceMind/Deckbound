import { t } from '../core/I18n.js';
import { wait } from '../anim/Animator.js';

/**
 * 🎰 命运赌坊 —— 猜牌（三选一，×2.5）与骰子大小（×1.9）。
 */
export class Casino {
  constructor(hub) {
    this.hub = hub;
  }

  async open() {
    const { modal } = this.hub;
    while (true) {
      const picked = await modal.show({
        title: t('casino.title'),
        bodyHTML: `<p>${t('casino.intro', { gold: this.hub.hero.gold })}</p>`,
        choices: [
          { label: t('casino.cardGame'), sub: t('casino.cardGameSub'), value: 'card' },
          { label: t('casino.diceGame'), sub: t('casino.diceGameSub'), value: 'dice' },
          { label: t('hub.back'), value: 'back' },
        ],
      });
      if (picked === 'card') await this._cardGame();
      else if (picked === 'dice') await this._diceGame();
      else return;
    }
  }

  async _cardGame() {
    const { hero, modal, rng, config } = this.hub;
    const cfg = config.casino;
    const stake = await modal.show({
      title: t('casino.cardGame'),
      bodyHTML: `<p>${t('casino.cardIntro', { mult: cfg.cardPayout })}</p>`,
      choices: [
        ...cfg.cardStakes.map((s) => ({ label: `💰 ${s}`, disabled: hero.gold < s, value: s })),
        { label: t('hub.back'), value: null },
      ],
    });
    if (!stake) return;
    hero.changeGold(-stake);

    const winIdx = rng.int(0, 2);
    const pick = await new Promise((resolve) => {
      const box = modal.showRaw();
      box.innerHTML = `<h2>${t('casino.pickCard')}</h2><div class="card-pick-row"></div>`;
      const row = box.querySelector('.card-pick-row');
      for (let i = 0; i < 3; i++) {
        const el = document.createElement('div');
        el.className = 'card card-back card-class';
        el.style.cursor = 'pointer';
        el.addEventListener('click', () => resolve(i));
        row.appendChild(el);
      }
    });

    // 翻牌演出
    const cards = document.querySelectorAll('.card-pick-row .card');
    cards.forEach((el, i) => {
      el.classList.remove('card-back');
      el.classList.add('flip-in');
      el.innerHTML = `<span class="card-emoji">${i === winIdx ? '💎' : '💨'}</span>`;
    });
    await wait(1200);
    modal.hide();

    if (pick === winIdx) {
      const win = Math.floor(stake * this.hub.config.casino.cardPayout);
      hero.changeGold(win);
      this.hub.toast(t('casino.cardWin', { n: win }));
    } else {
      this.hub.toast(t('casino.cardLose', { n: stake }));
    }
  }

  async _diceGame() {
    const { hero, modal, rng, config } = this.hub;
    const cfg = config.casino;
    const stake = await modal.show({
      title: t('casino.diceGame'),
      bodyHTML: `<p>${t('casino.diceIntro', { mult: cfg.dicePayout })}</p>`,
      choices: [
        ...cfg.cardStakes.map((s) => ({ label: `💰 ${s}`, disabled: hero.gold < s, value: s })),
        { label: t('hub.back'), value: null },
      ],
    });
    if (!stake) return;
    const side = await modal.show({
      title: t('casino.diceGame'),
      choices: [
        { label: t('casino.big'), value: 'big' },
        { label: t('casino.small'), value: 'small' },
      ],
    });
    hero.changeGold(-stake);
    const d1 = rng.int(1, 6), d2 = rng.int(1, 6);
    const sum = d1 + d2;
    const isBig = sum >= 7;
    const won = (side === 'big') === isBig;
    if (won) {
      const win = Math.floor(stake * cfg.dicePayout);
      hero.changeGold(win);
    }
    await modal.show({
      title: t('casino.diceGame'),
      bodyHTML: `<p style="font-size:34px">🎲 ${d1} + ${d2} = ${sum}</p><p>${won ? t('casino.diceWin', { n: Math.floor(stake * cfg.dicePayout) }) : t('casino.diceLose', { n: stake })}</p>`,
      choices: [{ label: t('hub.back'), value: 0 }],
    });
  }
}
