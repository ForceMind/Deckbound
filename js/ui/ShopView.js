import { t } from '../core/I18n.js';

/**
 * 商店 —— 商人卡触发。可购买装备/食物/药水，删除诅咒，付费刷新货架。
 */
export class ShopView {
  constructor(modal) {
    this.modal = modal;
  }

  async open(ctx) {
    const { player, ui } = ctx;
    const cfg = ctx.config.shop;
    let stock = this._rollStock(ctx);

    return new Promise((resolve) => {
      const render = () => {
        const box = this.modal.showRaw();
        box.innerHTML = `
          <h2>${t('shop.title')}</h2>
          <p>${t('shop.greeting')}<b style="color:var(--gold)">${player.gold}</b></p>
          <div class="shop-grid"></div>
          <div class="modal-choices"></div>`;

        const grid = box.querySelector('.shop-grid');
        stock.forEach((entry) => {
          const el = document.createElement('div');
          el.className = `shop-item${entry.sold ? ' sold' : ''}`;
          el.innerHTML = `
            <div class="shop-emoji">${entry.emoji}</div>
            <div class="shop-name">${entry.name}</div>
            <div class="shop-price">💰 ${entry.price}</div>
            <div class="shop-desc">${entry.desc}</div>`;
          if (!entry.sold) {
            el.addEventListener('click', () => {
              if (player.gold < entry.price) { ui.toast(t('shop.noGold')); return; }
              player.changeGold(-entry.price);
              entry.buy(ctx);
              entry.sold = true;
              render();
            });
          }
          grid.appendChild(el);
        });

        const actions = box.querySelector('.modal-choices');
        const mkBtn = (label, sub, disabled, fn) => {
          const btn = document.createElement('button');
          btn.className = 'modal-choice';
          btn.disabled = disabled;
          btn.innerHTML = `${label}${sub ? `<small>${sub}</small>` : ''}`;
          btn.addEventListener('click', fn);
          actions.appendChild(btn);
        };
        mkBtn(t('shop.refresh', { n: cfg.refreshCost }), t('shop.refreshSub'), player.gold < cfg.refreshCost, () => {
          player.changeGold(-cfg.refreshCost);
          stock = this._rollStock(ctx);
          render();
        });
        mkBtn(t('shop.removeCurse', { n: cfg.removeCurseCost }), t('shop.removeCurseSub', { n: player.curses }),
          player.curses === 0 || player.gold < cfg.removeCurseCost, () => {
            player.changeGold(-cfg.removeCurseCost);
            player.removeCurse();
            ui.toast(t('shop.curseRemoved'));
            render();
          });
        mkBtn(t('shop.leave'), null, false, () => { this.modal.hide(); resolve(); });
      };
      render();
    });
  }

  _rollStock(ctx) {
    const { rng, data, world } = ctx;
    const gen = ctx.game.generator;
    const stock = [];
    const kinds = rng.shuffle(['weapon', 'armor', 'food', 'food', 'potion', 'potion', 'weapon'])
      .slice(0, ctx.config.shop.stock);

    for (const kind of kinds) {
      if (kind === 'weapon' || kind === 'armor') {
        const rarity = gen.rollRarity(world.floor);
        const proto = rng.pick(kind === 'weapon' ? data.weapons : data.armors);
        const scaled = gen._scaleGear(proto, rarity);
        const mult = data.rarities[rarity]?.statMult ?? 1;
        stock.push({
          emoji: proto.emoji,
          name: `${proto.name}（${data.rarities[rarity].name}）`,
          price: Math.round(proto.price * mult),
          desc: kind === 'weapon'
            ? t('shop.weaponDesc', { atk: scaled.atk, power: scaled.power, crit: Math.round(scaled.crit * 100) })
            : t('shop.armorDesc', { block: scaled.block, hp: scaled.hp }),
          buy: (c) => {
            const item = { ...scaled, name: proto.name, emoji: proto.emoji };
            if (kind === 'weapon') c.player.equipWeapon(item);
            else c.player.equipArmor(item);
            c.ui.toast(t('shop.equipped', { name: proto.name }));
          },
        });
      } else if (kind === 'food') {
        const proto = rng.pick(data.items.food);
        stock.push({
          emoji: proto.emoji, name: proto.name, price: proto.price,
          desc: t('shop.foodDesc', { hp: proto.hp, energy: proto.energy }),
          buy: (c) => {
            if (!c.player.addItem('food', { ...proto })) {
              c.player.changeHp(proto.hp); c.player.changeEnergy(proto.energy);
              c.ui.toast(t('shop.fullEaten'));
            }
          },
        });
      } else {
        const proto = rng.pick(data.items.potion);
        stock.push({
          emoji: proto.emoji, name: proto.name, price: proto.price,
          desc: t('shop.potionDesc'),
          buy: (c) => {
            if (!c.player.addItem('potion', { ...proto })) c.game.drinkPotion();
          },
        });
      }
    }
    return stock;
  }
}
