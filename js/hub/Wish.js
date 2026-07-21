import { t } from '../core/I18n.js';
import { rollGear, gearStat } from '../core/GearFactory.js';

/**
 * ⛩️ 祈愿池 —— 花金币抽装备。十连保底至少一件史诗，未装备的关闭时自动折卖。
 */
export class Wish {
  constructor(hub) {
    this.hub = hub;
  }

  async open() {
    const { hero, modal, config } = this.hub;
    const cfg = config.wish;
    const picked = await modal.show({
      title: t('wish.title'),
      bodyHTML: `<p>${t('wish.intro', { total: hero.wishCount })}</p>`,
      choices: [
        { label: t('wish.single', { n: cfg.singleCost }), disabled: hero.gold < cfg.singleCost, value: 1 },
        { label: t('wish.ten', { n: cfg.tenCost }), sub: t('wish.tenSub'), disabled: hero.gold < cfg.tenCost, value: 10 },
        { label: t('hub.back'), value: null },
      ],
    });
    if (!picked) return;

    const { rng, data } = this.hub;
    hero.changeGold(-(picked === 10 ? cfg.tenCost : cfg.singleCost));
    hero.wishCount += picked;

    const weights = { common: 55, rare: 28, epic: 12, legendary: 4, mythic: 1 };
    const pulls = Array.from({ length: picked }, () => rollGear(data, rng, { weights }));
    // 十连保底：至少一件史诗+
    if (picked === 10 && !pulls.some((p) => ['epic', 'legendary', 'mythic'].includes(p.item.rarity))) {
      pulls[rng.int(0, 9)] = rollGear(data, rng, { weights: { epic: 85, legendary: 13, mythic: 2 } });
    }

    // 神明的额外眷顾：小概率附赠一件未拥有的神器（单抽 3%，十连 20%）
    const unowned = this.hub.unownedRelics();
    if (unowned.length && rng.chance(picked === 10 ? 0.2 : 0.03)) {
      const relic = rng.pick(unowned);
      this.hub.grantHeroRelic(relic);
      await modal.show({
        title: t('wish.bonusRelic'),
        bodyHTML: `<p style="font-size:44px;margin-bottom:4px">${relic.emoji}</p>
          <p><b style="color:${data.rarities[relic.rarity]?.color ?? '#fff'}">${relic.name}</b></p><p>${relic.desc}</p>`,
        choices: [{ label: t('relic.gainOk'), value: 0 }],
      });
    }

    // 结果面板：每件可点击装备（旧的折卖），关闭时未处理的按 60% 折卖
    await new Promise((resolve) => {
      const kept = new Set();
      const box = modal.showRaw();
      const render = () => {
        box.innerHTML = `<h2>${t('wish.resultTitle')}</h2><p>${t('wish.resultHint')}</p><div class="shop-grid"></div><div class="modal-choices"></div>`;
        const grid = box.querySelector('.shop-grid');
        pulls.forEach((p, i) => {
          const el = document.createElement('div');
          el.className = `shop-item${kept.has(i) ? ' sold' : ''}`;
          el.innerHTML = `
            <div class="shop-emoji">${p.item.emoji}</div>
            <div class="shop-name" style="color:${data.rarities[p.item.rarity]?.color ?? '#fff'}">${p.item.displayName}</div>
            <div class="shop-desc">${gearStat(p.kind, p.item, t)}</div>
            <div class="shop-price">${kept.has(i) ? t('wish.kept') : t('wish.clickKeep')}</div>`;
          if (!kept.has(i)) {
            el.addEventListener('click', () => {
              const how = hero.giveGear(p.kind, p.item);
              kept.add(i);
              this.hub.toast(how === 'equipped'
                ? t('toast.equipWeapon', { name: p.item.displayName })
                : how === 'bagged' ? t('toast.gearToBag', { name: p.item.displayName })
                : t('toast.gearSold', { name: p.item.displayName, n: hero.sellPrice(p.item) }));
              render();
            });
          }
          grid.appendChild(el);
        });
        const btn = document.createElement('button');
        btn.className = 'modal-choice';
        const rest = pulls.filter((_, i) => !kept.has(i));
        const refund = rest.reduce((s, p) => s + Math.max(1, Math.floor(p.item.price * cfg.pitySellPct)), 0);
        btn.innerHTML = `${t('wish.done')}<small>${rest.length ? t('wish.doneSub', { n: refund }) : ''}</small>`;
        btn.addEventListener('click', () => {
          hero.changeGold(refund);
          modal.hide();
          resolve();
        });
        box.querySelector('.modal-choices').appendChild(btn);
      };
      render();
    });
    hero.save();
  }
}
