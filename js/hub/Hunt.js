import { t } from '../core/I18n.js';
import { rollGear } from '../core/GearFactory.js';
import { wait } from '../anim/Animator.js';
import { sound } from '../core/Sound.js';

/**
 * 🐉 首领狩猎 —— 付入场费挑战强化版首领，胜利掉落高稀有装备与金币。
 */
export class Hunt {
  constructor(hub) {
    this.hub = hub;
  }

  async open() {
    const { hero, modal, rng, data, config } = this.hub;
    const cfg = config.hunt;
    const bosses = data.monsters.boss;

    const picked = await modal.show({
      title: t('hunt.title'),
      bodyHTML: `<p>${t('hunt.intro')}</p>`,
      choices: [
        ...bosses.map((b, i) => {
          const fee = cfg.baseFee + cfg.feeStep * i;
          const power = cfg.basePower + cfg.powerStep * i;
          const kills = hero.huntKills[b.id] ?? 0;
          return {
            label: `${b.emoji} ${b.name}　💪${power}`,
            sub: t('hunt.entry', { fee, kills }),
            disabled: hero.gold < fee,
            value: i,
          };
        }),
        { label: t('hub.back'), value: null },
      ],
    });
    if (picked === null || picked === undefined) return;

    const boss = bosses[picked];
    const fee = cfg.baseFee + cfg.feeStep * picked;
    const bossPower = cfg.basePower + cfg.powerStep * picked;
    hero.changeGold(-fee);
    sound.play('combat');

    // 战斗演出（roll ±12%）
    const box = modal.showRaw();
    box.classList.add('combat-panel');
    box.innerHTML = `
      <h2>${t('hunt.fightTitle', { name: boss.name })}</h2>
      <div class="combat-stage clash">
        <div class="combatant"><span class="fighter-emoji">${this.hub.classEmoji}</span><div class="fighter-name">${t('combat.you')}</div><div class="fighter-power">${hero.effectivePower}</div></div>
        <div class="combat-vs">${t('combat.vs')}</div>
        <div class="combatant"><span class="fighter-emoji">${boss.emoji}</span><div class="fighter-name">${boss.name}</div><div class="fighter-power">${bossPower}</div></div>
      </div>
      <div class="combat-result" id="hunt-result"></div>`;
    await wait(1600);

    const mine = hero.effectivePower * (0.88 + rng.next() * 0.24);
    const theirs = bossPower * (0.88 + rng.next() * 0.24);
    const won = mine >= theirs;
    sound.play(won ? 'win' : 'lose');
    const resultEl = box.querySelector('#hunt-result');
    box.querySelector('.combat-stage').classList.remove('clash');
    resultEl.className = `combat-result ${won ? 'victory' : 'defeat'}`;
    resultEl.textContent = won ? t('combat.victory') : t('combat.defeat');
    await wait(1100);
    modal.hide();

    if (won) {
      hero.huntKills[boss.id] = (hero.huntKills[boss.id] ?? 0) + 1;
      const gold = fee * 2;
      hero.changeGold(gold);
      const weights = picked < 2 ? { epic: 60, legendary: 32, mythic: 8 } : { epic: 35, legendary: 45, mythic: 20 };
      const drop = rollGear(data, rng, { weights });
      const how = hero.giveGear(drop.kind, drop.item);
      await modal.show({
        title: t('hunt.winTitle'),
        bodyHTML: `<p>${t('hunt.winText', { name: boss.name, gold })}</p><p>${drop.item.emoji} ${drop.item.displayName}${how === 'sold' ? t('arena.lootSold') : ''}</p>`,
        choices: [{ label: t('hub.back'), value: 0 }],
      });
    } else {
      await modal.show({
        title: t('hunt.loseTitle'),
        bodyHTML: `<p>${t('hunt.loseText', { name: boss.name, fee })}</p>`,
        choices: [{ label: t('hub.back'), value: 0 }],
      });
    }
    hero.save();
  }
}
