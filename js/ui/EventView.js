import { t } from '../core/I18n.js';

/**
 * 随机事件 —— 事件卡触发，展示文本与选项，按权重随机结果。
 */
export class EventView {
  constructor(modal) {
    this.modal = modal;
  }

  async open(ctx, proto) {
    const { player, rng, ui } = ctx;

    const choices = proto.choices.map((c, i) => ({
      label: c.text,
      sub: this._costText(c.cost),
      disabled: !this._canAfford(player, c.cost),
      value: i,
    }));

    // 事件链：NPC 有记忆（仅冒险主世界的持久角色）
    const mem = ctx.game.hero?.eventMemory;
    if (mem && proto.id === 'witch') {
      const q = mem.witchQuest;
      if (!q && !mem.witchQuestDone) {
        choices.unshift({ label: t('chain.witchAccept'), sub: t('chain.witchAcceptSub'), value: 'chain:witchAccept' });
      } else if (q?.active && (q.herbs ?? 0) >= 3) {
        choices.unshift({ label: t('chain.witchDeliver'), sub: t('chain.witchDeliverSub'), value: 'chain:witchDeliver' });
      } else if (q?.active) {
        choices.unshift({ label: t('chain.witchProgress', { n: q.herbs ?? 0 }), disabled: true, value: 'chain:noop' });
      }
    }
    if (mem && proto.id === 'old_man') {
      mem.oldManVisits = (mem.oldManVisits ?? 0) + 1;
      ctx.game.hero.save();
      if (mem.oldManVisits >= 3 && !mem.oldManGifted) {
        choices.unshift({ label: t('chain.oldGift'), sub: t('chain.oldGiftSub'), value: 'chain:oldGift' });
      }
    }

    const choice = await this.modal.show({
      title: `${proto.emoji} ${proto.name}`,
      bodyHTML: `<p>${proto.text}</p>`,
      choices,
    });

    // 事件链选项：独立结算
    if (typeof choice === 'string' && choice.startsWith('chain:')) {
      await this._resolveChain(ctx, choice.slice(6));
      return;
    }

    const picked = proto.choices[choice];
    this._payCost(player, picked.cost);
    const result = rng.weighted(picked.results);
    this._applyResult(ctx, result);

    await this.modal.show({
      title: `${proto.emoji} ${proto.name}`,
      bodyHTML: `<p>${result.text}</p>${this._resultText(result)}`,
      choices: [{ label: t('event.continue'), value: 0 }],
    });
    ui.toast(t('toast.eventDone', { name: proto.name, text: result.text }));
  }

  /** 事件链结算：女巫委托 / 老人馈赠 */
  async _resolveChain(ctx, action) {
    const hero = ctx.game.hero;
    const mem = hero.eventMemory;
    if (action === 'witchAccept') {
      mem.witchQuest = { active: true, herbs: 0 };
      hero.save();
      ctx.ui.toast(t('chain.witchAccepted'));
    } else if (action === 'witchDeliver') {
      mem.witchQuest = null;
      mem.witchQuestDone = true;
      hero.save();
      ctx.player.changePower(5);
      ctx.player.changeGold(40);
      await this.modal.show({
        title: t('chain.witchDoneTitle'),
        bodyHTML: `<p>${t('chain.witchDoneText')}</p>`,
        choices: [{ label: t('event.continue'), value: 0 }],
      });
    } else if (action === 'oldGift') {
      mem.oldManGifted = true;
      hero.save();
      ctx.player.changePower(3);
      ctx.ui.toast(t('chain.oldGifted'));
    }
  }

  _costText(cost) {
    if (!cost) return null;
    const parts = [];
    if (cost.gold) parts.push(t('event.costGold', { n: cost.gold }));
    if (cost.energy) parts.push(t('event.costEnergy', { n: cost.energy }));
    return parts.join('，') || null;
  }

  _canAfford(player, cost) {
    if (!cost) return true;
    if (cost.gold && player.gold < cost.gold) return false;
    if (cost.energy && player.energy < cost.energy) return false;
    return true;
  }

  _payCost(player, cost) {
    if (!cost) return;
    if (cost.gold) player.changeGold(-cost.gold);
    if (cost.energy) player.changeEnergy(-cost.energy);
  }

  _applyResult(ctx, r) {
    const { player, rng, data } = ctx;
    if (r.hp) player.changeHp(r.hp);
    if (r.maxHp) player.changeMaxHp(r.maxHp);
    if (r.power) player.changePower(r.power);
    if (r.gold) player.changeGold(r.gold);
    if (r.energy) player.changeEnergy(r.energy);
    if (r.curse) player.addCurse();
    if (r.givePotion) {
      const proto = rng.pick(data.items.potion);
      if (!player.addItem('potion', { ...proto })) ctx.game.drinkPotion();
    }
    if (r.giveWeapon) {
      const proto = rng.pick(data.weapons);
      const rarity = ctx.game.generator.rollRarity(ctx.world.floor);
      const scaled = ctx.game.generator._scaleGear(proto, rarity);
      ctx.game.giveGearSilent('weapon', { ...scaled, name: proto.name, emoji: proto.emoji });
    }
  }

  _resultText(r) {
    const parts = [];
    if (r.hp) parts.push(t('event.rHp', { n: (r.hp > 0 ? '+' : '') + r.hp }));
    if (r.maxHp) parts.push(t('event.rMaxHp', { n: r.maxHp }));
    if (r.power) parts.push(t('event.rPower', { n: r.power }));
    if (r.gold) parts.push(t('event.rGold', { n: r.gold }));
    if (r.curse) parts.push(t('event.rCurse'));
    if (r.givePotion) parts.push(t('event.rPotion'));
    if (r.giveWeapon) parts.push(t('event.rWeapon'));
    return parts.length ? `<p style="color:var(--gold)">${parts.join('　')}</p>` : '';
  }
}
