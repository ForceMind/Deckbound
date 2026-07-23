/**
 * 随机装备工厂 —— 大厅玩法（竞技场/拍卖行/试炼塔/狩猎/祈愿）共用的装备生成器。
 */
export const DEFAULT_WEIGHTS = { common: 55, rare: 28, epic: 12, legendary: 4, mythic: 1 };

/**
 * 装备数值缩放核心（地图掉落 / 商店 / 大厅玩法共用）：
 *   数值 = (基础 + 深度 × 深度成长) × 稀有度倍率
 * depth 即层数——但对玩家完全隐藏，只表现为「越深的地方装备越强越贵」。
 * crit 是百分比，只吃稀有度、不吃深度（否则会突破 100%）。
 * 返回带 power/block/hp/crit/price/rarity 的新对象（保留 proto 的 name/emoji 等）。
 */
export function scaleGearStats(proto, rarity, depth, rarities, gearCfg = {}) {
  const mult = rarities[rarity]?.statMult ?? 1;
  const s = { ...proto, rarity };
  if (s.power) s.power = Math.round((proto.power + depth * (gearCfg.depthPowerGrowth ?? 0)) * mult);
  if (s.block) s.block = Math.round((proto.block + depth * (gearCfg.depthBlockGrowth ?? 0)) * mult);
  if (s.hp) s.hp = Math.round((proto.hp + depth * (gearCfg.depthHpGrowth ?? 0)) * mult);
  if (s.crit) s.crit = Math.round(s.crit * (1 + (mult - 1) * 0.5) * 100) / 100;
  s.price = Math.round((proto.price ?? 0) * mult * (1 + depth * (gearCfg.depthPriceGrowth ?? 0)));
  return s;
}

export function rollGear(data, rng, opts = {}) {
  const kind = opts.kind ?? (rng.chance(0.6) ? 'weapon' : 'armor');
  const rarity = opts.rarity ?? rng.weighted(opts.weights ?? DEFAULT_WEIGHTS);
  const proto = rng.pick(kind === 'weapon' ? data.weapons : data.armors);

  const item = scaleGearStats(proto, rarity, opts.depth ?? 0, data.rarities, data.config?.gear);
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
