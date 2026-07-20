/**
 * 卡牌实体 —— 牌阵世界的最小单元。
 * type 决定行为（由 CardEffects 注册表分发），data 携带类型专属数据。
 * 新增卡牌种类只需：cardTypes.json 加一行 + CardEffects 注册一个 handler。
 */
let _nextId = 1;

export class Card {
  constructor(type, { name, emoji, rarity = 'common', data = {} } = {}) {
    this.id = _nextId++;
    this.type = type;
    this.name = name;
    this.emoji = emoji;
    this.rarity = rarity;
    this.data = data;
  }

  get isEnemy() {
    return ['monster', 'elite', 'boss', 'mirror'].includes(this.type);
  }

  /** 战力（仅敌人卡有意义） */
  get power() {
    return this.data.power ?? 0;
  }

  clone() {
    const c = new Card(this.type, {
      name: this.name,
      emoji: this.emoji,
      rarity: this.rarity,
      data: { ...this.data },
    });
    return c;
  }
}
