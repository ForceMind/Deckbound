import { t } from '../core/I18n.js';
import { rollGear, gearStat } from '../core/GearFactory.js';

/**
 * 🏛️ 拍卖行 —— AI 挂单出售装备（溢价），玩家可购买；自己的装备可按估价卖出。
 */
export class Auction {
  constructor(hub) {
    this.hub = hub;
    this.listings = null;
  }

  _rollListings() {
    const { rng, data, config } = this.hub;
    const cfg = config.auction;
    const listings = Array.from({ length: cfg.listings }, () => {
      const { kind, item } = rollGear(data, rng, { weights: { common: 30, rare: 35, epic: 25, legendary: 8, mythic: 2 } });
      const price = Math.round(item.price * (cfg.markupMin + rng.next() * (cfg.markupMax - cfg.markupMin)));
      return { kind, item, price, sold: false };
    });
    // 12% 概率出现一条神器挂单（稀有货源，价格不菲）
    const unowned = this.hub.unownedRelics();
    if (unowned.length && rng.chance(0.12)) {
      const relic = rng.pick(unowned);
      listings.push({ relic, price: 120 + rng.int(0, 80), sold: false });
    }
    return listings;
  }

  async open() {
    const { hero, modal, config } = this.hub;
    if (!this.listings) this.listings = this._rollListings();

    while (true) {
      const buyChoices = this.listings.map((l, i) => (l.relic
        ? {
          label: `🏺 ${l.relic.emoji} ${l.relic.name}　💰${l.price}`,
          sub: `${l.relic.desc}${l.sold ? `　${t('auction.sold')}` : ''}`,
          disabled: l.sold || hero.gold < l.price,
          value: `buy:${i}`,
        }
        : {
          label: `${l.item.emoji} ${l.item.displayName}　💰${l.price}`,
          sub: `${gearStat(l.kind, l.item, t)}${l.sold ? `　${t('auction.sold')}` : ''}`,
          disabled: l.sold || hero.gold < l.price,
          value: `buy:${i}`,
        }));
      const sellChoices = hero.inventory
        .map((e, i) => ({ e, i }))
        .filter(({ e }) => e.kind === 'weapon' || e.kind === 'armor')
        .map(({ e, i }) => ({
          label: t('auction.sellItem', { name: `${e.item.emoji} ${e.item.displayName ?? e.item.name}`, n: hero.sellPrice(e.item) }),
          sub: gearStat(e.kind, e.item, t),
          value: `sell:${i}`,
        }));

      const picked = await modal.show({
        title: t('auction.title'),
        bodyHTML: `<p>${t('auction.intro', { gold: hero.gold })}</p>`,
        choices: [
          ...buyChoices,
          ...sellChoices,
          { label: t('auction.refresh', { n: config.auction.refreshCost }), disabled: hero.gold < config.auction.refreshCost, value: 'refresh' },
          { label: t('hub.back'), value: 'back' },
        ],
      });

      if (picked === 'back' || picked === undefined) return;
      if (picked === 'refresh') {
        hero.changeGold(-config.auction.refreshCost);
        this.listings = this._rollListings();
        continue;
      }
      const [action, idxStr] = picked.split(':');
      const idx = Number(idxStr);
      if (action === 'buy') {
        const l = this.listings[idx];
        if (l.sold || hero.gold < l.price) continue;
        hero.changeGold(-l.price);
        l.sold = true;
        if (l.relic) {
          this.hub.grantHeroRelic(l.relic);
          this.hub.toast(t('relic.bought', { name: `${l.relic.emoji} ${l.relic.name}` }));
          continue;
        }
        const how = hero.giveGear(l.kind, l.item);
        this.hub.toast(how === 'equipped'
          ? t('toast.equipWeapon', { name: l.item.displayName })
          : how === 'bagged' ? t('toast.gearToBag', { name: l.item.displayName })
          : t('toast.gearSold', { name: l.item.displayName, n: hero.sellPrice(l.item) }));
      } else {
        const entry = hero.inventory[idx];
        if (!entry) continue;
        hero.inventory.splice(idx, 1);
        hero.changeGold(hero.sellPrice(entry.item));
        this.hub.toast(t('toast.gearSold', { name: entry.item.displayName ?? entry.item.name, n: hero.sellPrice(entry.item) }));
      }
    }
  }
}
