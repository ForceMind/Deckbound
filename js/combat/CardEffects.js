import { Card } from '../entities/Card.js';
import { t } from '../core/I18n.js';

/**
 * 卡牌效果注册表 —— 玩家踩上一张牌后发生什么。
 * 每个 handler: async (ctx, card) => ({ retreat?: boolean })
 *   ctx = { game, player, world, ui, rng, data, config }
 *   retreat: true 表示玩家被击退，留在原行（战斗失败时）。
 * 扩展新卡种：在此注册 + cardTypes.json / spawn.json 配一行即可。
 */
const handlers = new Map();

export function registerEffect(type, handler) {
  handlers.set(type, handler);
}

export async function applyEffect(ctx, card) {
  const handler = handlers.get(card.type);
  if (!handler) return {};
  return (await handler(ctx, card)) ?? {};
}

/* ============ 敌人 ============ */
async function fightHandler(ctx, card) {
  const result = ctx.game.combat.resolve(ctx.player, card);
  await ctx.ui.combatView.play(ctx.player, card, result);

  if (result.win) {
    ctx.player.changePower(result.powerGain);
    ctx.player.changeGold(result.goldGain);
    const ups = ctx.player.addExp(result.expGain);
    ctx.game.stats.kills += 1;
    if (result.tier === 'boss') ctx.game.stats.bossKills += 1;
    const key = result.crit ? 'toast.fightWinCrit' : 'toast.fightWin';
    ctx.ui.toast(t(key, { name: card.name, power: result.powerGain, gold: result.goldGain, exp: result.expGain }));
    for (const lv of ups) ctx.ui.toast(t('toast.levelUp', { n: lv }));
    return { won: true };
  }
  ctx.player.changeHp(-result.damage);
  // 神器·血契：不被击退，强行突破
  if (result.bloodPact && ctx.player.hp > 0) {
    ctx.ui.toast(t('toast.fightLoseBloodPact', { name: card.name, dmg: result.damage }));
    return {};
  }
  ctx.ui.toast(t('toast.fightLose', { name: card.name, dmg: result.damage }));
  return { retreat: true };
}
registerEffect('monster', fightHandler);
registerEffect('elite', async (ctx, card) => fightHandler(ctx, card));
registerEffect('boss', async (ctx, card) => {
  const result = await fightHandler(ctx, card);
  // 首领必掉一件未拥有的神器（只有真正击败才掉，血契强行突破不算）
  if (result.won) await ctx.game.grantRelic();
  return result;
});
registerEffect('mirror', fightHandler);

/* ============ 装备（装备栏系统：不顶掉，玩家选择） ============ */
registerEffect('weapon', async (ctx, card) => {
  await ctx.game.acquireGear('weapon', { ...card.data, name: card.name, emoji: card.emoji });
});

registerEffect('armor', async (ctx, card) => {
  await ctx.game.acquireGear('armor', { ...card.data, name: card.name, emoji: card.emoji });
});

/* ============ 消耗品 ============ */
registerEffect('food', async (ctx, card) => {
  if (ctx.player.addItem('food', { ...card.data, name: card.name, emoji: card.emoji })) {
    ctx.ui.toast(t('toast.pickFood', { name: card.name }));
  } else {
    // 背包满则当场吃掉
    ctx.player.changeHp(card.data.hp ?? 0);
    ctx.player.changeEnergy(card.data.energy ?? 0);
    ctx.ui.toast(t('toast.eatFoodFull', { name: card.name, hp: card.data.hp, energy: card.data.energy }));
  }
});

registerEffect('potion', async (ctx, card) => {
  if (ctx.player.addItem('potion', { ...card.data, name: card.name, emoji: card.emoji })) {
    ctx.ui.toast(t('toast.pickPotion', { name: card.name }));
  } else {
    ctx.game.drinkPotion();
  }
});

registerEffect('key', async (ctx, card) => {
  if (ctx.player.addItem('key', { name: card.name, emoji: card.emoji })) {
    ctx.ui.toast(t('toast.gotKey'));
  } else {
    ctx.ui.toast(t('toast.keyFull'));
  }
});

/* ============ 拾取 ============ */
/** 神器·幸运金币：拾取金币 +30% */
const luckyGold = (ctx, n) => Math.round(n * (ctx.player.hasRelic('lucky_coin') ? 1.3 : 1));

registerEffect('gold', async (ctx, card) => {
  const amount = luckyGold(ctx, card.data.amount ?? 5);
  ctx.player.changeGold(amount);
  ctx.ui.toast(t('toast.pickGold', { n: amount }));
});

registerEffect('treasure', async (ctx, card) => {
  const gold = luckyGold(ctx, ctx.rng.int(10, 20) + ctx.world.floor * 2);
  ctx.player.changeGold(gold);
  ctx.ui.toast(t('toast.treasure', { n: gold }));
});

registerEffect('chest', async (ctx, card) => {
  const roll = ctx.rng.next();
  // 神器·贪婪之瞳：宝箱永远不是宝箱怪
  if (roll < 0.12 && !ctx.player.hasRelic('greed_eye')) {
    // 宝箱怪！
    const power = Math.round(6 + ctx.world.floor * 1.1);
    const mimic = new Card('monster', { name: t('toast.mimicName'), emoji: '📦', data: { power, tier: 'monster' } });
    ctx.ui.toast(t('toast.mimic'));
    return fightHandler(ctx, mimic);
  }
  if (roll < 0.55) {
    const gold = luckyGold(ctx, ctx.rng.int(8, 16) + ctx.world.floor);
    ctx.player.changeGold(gold);
    ctx.ui.toast(t('toast.chestGold', { n: gold }));
  } else {
    const proto = ctx.rng.pick(ctx.data.items.food);
    if (ctx.player.addItem('food', { ...proto })) ctx.ui.toast(t('toast.chestFood', { name: proto.name }));
    else { ctx.player.changeGold(6); ctx.ui.toast(t('toast.chestFull')); }
  }
});

/* ============ 危险 ============ */
registerEffect('trap', async (ctx) => {
  const dmg = Math.max(1, ctx.rng.int(3, 6) + Math.floor(ctx.world.floor / 3) - ctx.player.block);
  ctx.player.changeHp(-dmg);
  ctx.ui.toast(t('toast.trap', { n: dmg }));
});

registerEffect('fire', async (ctx) => {
  // 神器·余烬护符：火焰无害，反而恢复体力
  if (ctx.player.hasRelic('ember_charm')) {
    ctx.player.changeEnergy(1);
    ctx.ui.toast(t('toast.fireImmune'));
    return;
  }
  const dmg = Math.max(1, ctx.rng.int(4, 8) - ctx.player.block);
  ctx.player.changeHp(-dmg);
  ctx.ui.toast(t('toast.fire', { n: dmg }));
});

registerEffect('curse', async (ctx) => {
  ctx.player.addCurse();
  ctx.ui.toast(t('toast.cursed'));
});

/* ============ 恢复 ============ */
registerEffect('campfire', async (ctx) => {
  const heal = 6 + (ctx.player.restHeal ?? 0);
  ctx.player.changeHp(heal);
  ctx.player.changeEnergy(2);
  ctx.ui.toast(t('toast.campfire', { hp: heal }));
});

registerEffect('shrine', async (ctx) => {
  const blessing = ctx.rng.pick([
    { key: 'power', apply: (p) => p.changePower(2) },
    { key: 'gold', apply: (p) => p.changeGold(15) },
    { key: 'maxHp', apply: (p) => { p.changeMaxHp(4); p.changeHp(4); } },
    { key: 'energy', apply: (p) => p.changeEnergy(99) },
  ]);
  blessing.apply(ctx.player);
  ctx.ui.toast(t('toast.shrine', { text: t(`shrineBuffs.${blessing.key}`) }));
});

registerEffect('spring', async (ctx) => {
  const gain = ctx.rng.int(2, 4);
  ctx.player.changeEnergy(gain);
  ctx.ui.toast(t('toast.spring', { n: gain }));
});

registerEffect('blessing', async (ctx) => {
  if (ctx.player.curses > 0 && ctx.rng.chance(0.5)) {
    ctx.player.removeCurse();
    ctx.ui.toast(t('toast.blessingCleanse'));
  } else {
    ctx.player.changePower(1);
    ctx.player.changeHp(4);
    ctx.ui.toast(t('toast.blessing'));
  }
});

/* ============ 特殊 ============ */
registerEffect('door', async (ctx) => {
  // 神器·万能钥环：开门不需要钥匙
  if (ctx.player.hasRelic('key_ring') || ctx.player.consumeKey()) {
    const gold = 20 + ctx.world.floor * 3;
    ctx.player.changeGold(gold);
    ctx.player.changePower(2);
    ctx.ui.toast(t('toast.doorOpen', { gold }));
  } else {
    ctx.ui.toast(t('toast.doorLocked'));
  }
});

registerEffect('teleport', async (ctx) => {
  ctx.ui.toast(t('toast.teleport'));
  return { teleport: true };
});

registerEffect('merchant', async (ctx) => {
  await ctx.ui.shopView.open(ctx);
});

registerEffect('event', async (ctx, card) => {
  const proto = ctx.data.events.find((e) => e.id === card.data.eventId);
  if (proto) await ctx.ui.eventView.open(ctx, proto);
});

registerEffect('empty', async () => ({}));
