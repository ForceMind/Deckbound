import { Card } from '../entities/Card.js';

/**
 * 地图生成器 —— 按层数动态生成一行 9 张卡。
 * 不是完全随机：spawn.json 定义基础权重 + 层数增益曲线 + 出现下限，
 * 层数越深，怪物/精英/稀有牌概率越高，Boss 按固定间隔出现。
 */
export class MapGenerator {
  constructor(data, rng) {
    this.data = data;
    this.rng = rng;
    this.config = data.config;
    this.spawn = data.spawn;
    this.rarities = data.rarities;
  }

  /** 当前层所属章节的牌池偏移（Biome：白骨荒原多诅咒、燃烧深渊多火焰…） */
  _biomeBias(floor) {
    const ch = this.data.story?.chapters?.find((c) => floor >= c.from && floor <= c.to);
    return ch?.spawnBias ?? null;
  }

  /** 生成第 floor 层的一行牌 */
  generateRow(floor) {
    const cols = this.config.grid.cols;
    const isBossFloor = floor > 0 && floor % this.config.boss.interval === 0;
    const bias = this._biomeBias(floor);
    const rowCount = {};
    const row = [];

    for (let col = 0; col < cols; col++) {
      if (isBossFloor && col === Math.floor(cols / 2)) {
        row.push(this._makeBoss(floor));
        rowCount.boss = 1;
        continue;
      }
      const type = this._rollType(floor, rowCount, bias);
      rowCount[type] = (rowCount[type] ?? 0) + 1;
      row.push(this._makeCard(type, floor));
    }
    return row;
  }

  _rollType(floor, rowCount, bias) {
    const weights = {};
    for (const [type, base] of Object.entries(this.spawn.baseWeights)) {
      // 未到出现层数下限的类型不生成
      if ((this.spawn.floorMinimum[type] ?? 0) > floor) continue;
      // 每行数量上限（商人/传送门等）
      const cap = this.spawn.maxPerRow[type];
      if (cap && (rowCount[type] ?? 0) >= cap) continue;
      const scale = this.spawn.floorScaling[type] ?? 0;
      weights[type] = Math.max(0, (base + scale * floor) * (bias?.[type] ?? 1));
    }
    // 女巫委托激活时，月光草会出现在牌阵中
    if (this.hero?.eventMemory?.witchQuest?.active) weights.herb = 6;
    return this.rng.weighted(weights) ?? 'empty';
  }

  /** 稀有度随层数上浮 */
  rollRarity(floor) {
    const weights = { ...this.rarities.baseWeights };
    for (const [r, bonus] of Object.entries(this.rarities.floorBonus)) {
      weights[r] += bonus * floor;
    }
    return this.rng.weighted(weights);
  }

  _makeCard(type, floor) {
    switch (type) {
      case 'monster':
      case 'elite':
        return this._makeMonster(type, floor);
      case 'mirror': {
        const proto = this.data.monsters.mirror[0];
        return new Card('mirror', { name: proto.name, emoji: proto.emoji, rarity: 'epic', data: { mirror: true } });
      }
      case 'weapon': {
        const rarity = this.rollRarity(floor);
        const proto = this.rng.pick(this.data.weapons);
        return new Card('weapon', { name: proto.name, emoji: proto.emoji, rarity, data: this._scaleGear(proto, rarity) });
      }
      case 'armor': {
        const rarity = this.rollRarity(floor);
        const proto = this.rng.pick(this.data.armors);
        return new Card('armor', { name: proto.name, emoji: proto.emoji, rarity, data: this._scaleGear(proto, rarity) });
      }
      case 'food': {
        const proto = this.rng.pick(this.data.items.food);
        return new Card('food', { name: proto.name, emoji: proto.emoji, data: { ...proto } });
      }
      case 'potion': {
        const proto = this.rng.pick(this.data.items.potion);
        return new Card('potion', { name: proto.name, emoji: proto.emoji, rarity: 'rare', data: { ...proto } });
      }
      case 'gold': {
        const amount = this.rng.int(3 + floor, 8 + floor * 2);
        return new Card('gold', { name: `${amount} 金币`, emoji: '💰', data: { amount } });
      }
      case 'event': {
        const proto = this.rng.pick(this.data.events);
        return new Card('event', { name: proto.name, emoji: proto.emoji, rarity: 'rare', data: { eventId: proto.id } });
      }
      default: {
        const meta = this.data.cardTypes[type] ?? { name: type, emoji: '❓' };
        const rarity = ['treasure', 'chest', 'blessing'].includes(type) ? this.rollRarity(floor) : 'common';
        return new Card(type, { name: meta.name, emoji: meta.emoji, rarity, data: {} });
      }
    }
  }

  _makeMonster(tier, floor) {
    const proto = this.rng.pick(this.data.monsters[tier]);
    // 等级围绕层数浮动，词缀（虚弱/饥饿/凶暴/远古）进一步拉开个体差异
    const level = Math.max(1, floor + this.rng.int(-1, 1));
    const mod = this.rng.weighted(this.config.monsterModifiers ?? [{ prefix: '', mult: 1, weight: 1 }]);
    const power = Math.max(1, Math.round((proto.basePower + proto.perFloor * level + this.rng.int(-1, 2)) * mod.mult));
    let rarity = tier === 'elite' ? 'epic' : 'common';
    if (mod.mult >= 1.4) rarity = tier === 'elite' ? 'legendary' : 'rare';
    return new Card(tier, {
      name: `${mod.prefix}${proto.name}`,
      emoji: proto.emoji,
      rarity,
      data: { power, tier, level },
    });
  }

  _makeBoss(floor) {
    const proto = this.rng.pick(this.data.monsters.boss);
    const power = Math.round(proto.basePower + proto.perFloor * floor);
    return new Card('boss', {
      name: proto.name,
      emoji: proto.emoji,
      rarity: 'legendary',
      data: { power, tier: 'boss', level: floor, skill: proto.skill ?? null },
    });
  }

  /** 装备按稀有度放大数值 */
  _scaleGear(proto, rarity) {
    const mult = this.rarities[rarity]?.statMult ?? 1;
    const scaled = { ...proto };
    for (const key of ['power', 'block', 'hp']) {
      if (scaled[key]) scaled[key] = Math.round(scaled[key] * mult);
    }
    if (scaled.crit) scaled.crit = Math.round(scaled.crit * (1 + (mult - 1) * 0.5) * 100) / 100;
    scaled.rarity = rarity;
    return scaled;
  }
}
