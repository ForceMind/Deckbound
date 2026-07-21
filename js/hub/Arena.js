import { t } from '../core/I18n.js';
import { rollGear, gearStat } from '../core/GearFactory.js';
import { wait } from '../anim/Animator.js';
import { sound } from '../core/Sound.js';

/**
 * ⚔️ 竞技场 —— 押注金币与 AI 对手战力对决（三轮两胜）。
 * 赢：拿走对手的押注金币和全部装备；输：失去押注，并被夺走一件背包装备。
 */
export class Arena {
  constructor(hub) {
    this.hub = hub;
  }

  async open() {
    const { hero, modal, rng, data, config } = this.hub;
    const cfg = config.arena;

    const stake = await modal.show({
      title: t('arena.title'),
      bodyHTML: `<p>${t('arena.intro')}</p><p>${t('arena.record', { w: hero.arenaWins, l: hero.arenaLosses })}</p>`,
      choices: [
        ...cfg.stakes.map((s) => ({
          label: t('arena.stake', { n: s }),
          disabled: hero.gold < s,
          value: s,
        })),
        { label: t('hub.back'), value: null },
      ],
    });
    if (!stake) return;

    // 生成对手：战力围绕玩家浮动，押注越高装备越好
    const tier = cfg.stakes.indexOf(stake);
    const oppPower = Math.max(3, Math.round(hero.effectivePower * (0.85 + rng.next() * 0.3)));
    const oppName = rng.pick([t('arena.opp1'), t('arena.opp2'), t('arena.opp3'), t('arena.opp4')]);
    const oppEmoji = rng.pick(['🥷', '🧝', '🧙‍♂️', '🤺', '🧌']);
    const weights = tier === 0 ? { common: 50, rare: 35, epic: 15 } : tier === 1 ? { rare: 45, epic: 40, legendary: 15 } : { epic: 50, legendary: 40, mythic: 10 };
    const loot = [rollGear(data, rng, { weights })];
    if (rng.chance(0.5)) loot.push(rollGear(data, rng, { weights }));

    hero.changeGold(-stake);
    sound.play('combat');

    // 三轮两胜：双方每轮 roll 战力 ±15%
    const box = modal.showRaw();
    box.innerHTML = `
      <h2>${t('arena.title')}</h2>
      <div class="combat-stage">
        <div class="combatant"><span class="fighter-emoji">${this.hub.classEmoji}</span><div class="fighter-name">${t('combat.you')}</div><div class="fighter-power">${hero.effectivePower}</div></div>
        <div class="combat-vs">${t('combat.vs')}</div>
        <div class="combatant"><span class="fighter-emoji">${oppEmoji}</span><div class="fighter-name">${oppName}</div><div class="fighter-power">${oppPower}</div></div>
      </div>
      <div id="arena-rounds" style="min-height:70px"></div>
      <div class="combat-result" id="arena-result"></div>`;
    const roundsEl = box.querySelector('#arena-rounds');

    let myWins = 0, oppWins = 0;
    for (let r = 1; myWins < 2 && oppWins < 2; r++) {
      await wait(700);
      const mine = Math.round(hero.effectivePower * (0.85 + rng.next() * 0.3));
      const theirs = Math.round(oppPower * (0.85 + rng.next() * 0.3));
      const win = mine >= theirs;
      if (win) myWins++; else oppWins++;
      const line = document.createElement('p');
      line.innerHTML = t('arena.round', { r, mine, theirs, result: win ? '✅' : '❌' });
      roundsEl.appendChild(line);
    }
    await wait(500);

    const won = myWins >= 2;
    sound.play(won ? 'win' : 'lose');
    const resultEl = box.querySelector('#arena-result');
    resultEl.className = `combat-result ${won ? 'victory' : 'defeat'}`;
    resultEl.textContent = won ? t('combat.victory') : t('combat.defeat');
    await wait(1100);
    modal.hide();

    if (won) {
      hero.arenaWins += 1;
      hero.changeGold(stake * 2);
      const gained = [];
      for (const { kind, item } of loot) {
        const how = hero.giveGear(kind, item);
        gained.push(`${item.emoji} ${item.displayName}${how === 'sold' ? t('arena.lootSold') : ''}`);
      }
      await modal.show({
        title: t('arena.winTitle'),
        bodyHTML: `<p>${t('arena.winText', { n: stake * 2 })}</p><p>${t('arena.lootList', { list: gained.join('<br>') })}</p>`,
        choices: [{ label: t('hub.back'), value: 0 }],
      });
    } else {
      hero.arenaLosses += 1;
      let lostGear = '';
      if (hero.inventory.length > 0) {
        const idx = rng.int(0, hero.inventory.length - 1);
        const gearOnly = hero.inventory.map((e, i) => ({ e, i })).filter(({ e }) => e.kind === 'weapon' || e.kind === 'armor');
        const victim = gearOnly.length ? rng.pick(gearOnly) : { e: hero.inventory[idx], i: idx };
        hero.inventory.splice(victim.i, 1);
        hero.save();
        lostGear = t('arena.lostGear', { name: `${victim.e.item.emoji} ${victim.e.item.displayName ?? victim.e.item.name}` });
      }
      await modal.show({
        title: t('arena.loseTitle'),
        bodyHTML: `<p>${t('arena.loseText', { n: stake })}</p>${lostGear ? `<p>${lostGear}</p>` : ''}`,
        choices: [{ label: t('hub.back'), value: 0 }],
      });
    }
    hero.save();
  }
}
