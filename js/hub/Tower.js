import { t } from '../core/I18n.js';
import { rollGear } from '../core/GearFactory.js';

/**
 * 🗼 试炼塔 —— 连续战斗爬层：敌人战力逐层递增，奖池随胜利累积。
 * 随时撤退带走奖池；战败奖池减半结算。记录最高塔层。
 */
export class Tower {
  constructor(hub) {
    this.hub = hub;
  }

  async open() {
    const { hero, modal, rng, data, config } = this.hub;
    const cfg = config.tower;
    let floor = 1;
    let pot = 0;
    const gears = [];

    while (true) {
      const enemyPower = Math.max(3, Math.round(hero.effectivePower * (0.72 + 0.09 * floor) + rng.int(-2, 2)));
      const winOdds = this._estimateOdds(hero.effectivePower, enemyPower);

      const picked = await modal.show({
        title: t('tower.title', { n: floor }),
        bodyHTML: `
          <p>${t('tower.enemy', { power: enemyPower, mine: hero.effectivePower, odds: Math.round(winOdds * 100) })}</p>
          <p>${t('tower.pot', { n: pot, gears: gears.length })}　${t('tower.best', { n: hero.towerBest })}</p>`,
        choices: [
          { label: t('tower.fight'), value: 'fight' },
          { label: t('tower.retreat', { n: pot }), value: 'retreat' },
        ],
      });

      if (picked !== 'fight') break;

      // 双方 roll ±15%
      const mine = hero.effectivePower * (0.85 + rng.next() * 0.3);
      const theirs = enemyPower * (0.85 + rng.next() * 0.3);
      if (mine >= theirs) {
        pot += cfg.baseReward + cfg.rewardPerFloor * floor;
        if (floor % cfg.gearDropEvery === 0 && rng.chance(cfg.gearDropChance)) {
          const drop = rollGear(data, rng, { weights: { rare: 45, epic: 38, legendary: 14, mythic: 3 } });
          gears.push(drop);
          this.hub.toast(t('tower.gearDrop', { name: `${drop.item.emoji} ${drop.item.displayName}` }));
        }
        floor += 1;
        if (floor - 1 > hero.towerBest) { hero.towerBest = floor - 1; hero.save(); }
      } else {
        pot = Math.floor(pot / 2);
        await modal.show({
          title: t('tower.defeatTitle'),
          bodyHTML: `<p>${t('tower.defeatText', { n: pot })}</p>`,
          choices: [{ label: t('hub.back'), value: 0 }],
        });
        break;
      }
    }

    // 结算
    if (pot > 0 || gears.length) {
      hero.changeGold(pot);
      const gained = gears.map(({ kind, item }) => {
        const how = hero.giveGear(kind, item);
        return `${item.emoji} ${item.displayName}${how === 'sold' ? t('arena.lootSold') : ''}`;
      });
      await modal.show({
        title: t('tower.settleTitle'),
        bodyHTML: `<p>${t('tower.settleText', { floor: Math.max(1, floor - 1), gold: pot })}</p>${gained.length ? `<p>${gained.join('<br>')}</p>` : ''}`,
        choices: [{ label: t('hub.back'), value: 0 }],
      });
    }
    hero.save();
  }

  _estimateOdds(mine, theirs) {
    // 双方均匀 roll ±15% 时的近似胜率
    const ratio = mine / theirs;
    return Math.max(0.02, Math.min(0.98, (ratio - 0.7) / 0.6));
  }
}
