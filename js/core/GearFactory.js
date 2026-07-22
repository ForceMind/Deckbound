/**
 * 随机装备工厂 —— 大厅玩法（竞技场/拍卖行/试炼塔/狩猎/祈愿）共用的装备生成器。
 */
export const DEFAULT_WEIGHTS = { common: 55, rare: 28, epic: 12, legendary: 4, mythic: 1 };

export function rollGear(data, rng, opts = {}) {
  const kind = opts.kind ?? (rng.chance(0.6) ? 'weapon' : 'armor');
  const rarity = opts.rarity ?? rng.weighted(opts.weights ?? DEFAULT_WEIGHTS);
  const proto = rng.pick(kind === 'weapon' ? data.weapons : data.armors);
  const mult = data.rarities[rarity]?.statMult ?? 1;

  const item = { ...proto, rarity };
  for (const key of ['power', 'block', 'hp']) {
    if (item[key]) item[key] = Math.round(item[key] * mult);
  }
  if (item.crit) item.crit = Math.round(item.crit * (1 + (mult - 1) * 0.5) * 100) / 100;
  item.price = Math.round(proto.price * mult);
  item.displayName = gearName(item, data.rarities);
  return { kind, item };
}

/** 装备显示名带稀有度后缀（同名不同稀有度不混淆），冒险与大厅统一 */
export function gearName(item, rarities) {
  const r = rarities[item.rarity];
  return r && item.rarity !== 'common' ? `${item.name}（${r.name}）` : item.name;
}

/** 装备一句话属性（大厅界面通用） */
export function gearStat(kind, item, t) {
  return kind === 'weapon'
    ? t('hud.weaponStat', { power: item.power ?? 0, crit: Math.round((item.crit ?? 0) * 100) })
    : t('hud.armorStat', { block: item.block ?? 0 });
}
