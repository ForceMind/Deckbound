/**
 * 持久角色 —— 整个游戏只有一个主角，跨局成长（localStorage）。
 * 冒险主世界是养成来源：战力/属性/装备/金币全部持久保留；
 * 死亡只损失部分金币，不清零成长。其他玩法（竞技场/拍卖行/试炼塔…）共用此角色。
 */
const KEY = 'deckbound_hero_v1';

export class Hero {
  constructor(raw, config) {
    Object.assign(this, raw);
    this.config = config;
  }

  static load(config) {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      return new Hero(JSON.parse(raw), config);
    } catch {
      return null;
    }
  }

  static create(config, cls) {
    const base = config.player;
    const b = cls.bonus ?? {};
    const hero = new Hero({
      created: Date.now(),
      classId: cls.id,
      level: 1,
      exp: 0,
      currentFloor: 1,
      maxHp: base.maxHp + (b.maxHp ?? 0),
      power: base.power + (b.power ?? 0),
      maxEnergy: base.maxEnergy,
      inventorySize: base.inventorySize,
      gold: base.gold,
      weapon: null,
      armor: null,
      inventory: [],
      curses: 0,
      relics: [],
      achievements: [],
      eventMemory: {},
      codex: { monsters: {}, gear: [] },
      stats: { adventures: 0, deaths: 0, deepestFloor: 0, kills: 0, bossKills: 0, throneWins: 0, crits: 0 },
      towerBest: 0,
      arenaWins: 0,
      arenaLosses: 0,
      huntKills: {},
      wishCount: 0,
    }, config);
    hero.save();
    return hero;
  }

  save() {
    const { config, ...raw } = this;
    try { localStorage.setItem(KEY, JSON.stringify(raw)); } catch { /* 忽略 */ }
  }

  static reset() {
    localStorage.removeItem(KEY);
  }

  /** 冒险中的运行时 Player 状态回写到持久角色 */
  syncFromPlayer(p) {
    this.level = p.level;
    this.exp = p.exp;
    this.maxEnergy = p.maxEnergy;
    this.maxHp = p.maxHp;
    this.power = p.power;
    this.gold = p.gold;
    this.weapon = p.weapon;
    this.armor = p.armor;
    this.inventory = p.inventory;
    this.inventorySize = p.inventorySize;
    this.curses = p.curses;
    this.relics = [...p.relics];
    this.save();
  }

  hasRelic(id) {
    return (this.relics ?? []).includes(id);
  }

  /** 图鉴：记录击杀的怪物种类 */
  recordMonsterKill(protoId) {
    if (!protoId) return;
    if (!this.codex) this.codex = { monsters: {}, gear: [] };
    this.codex.monsters[protoId] = (this.codex.monsters[protoId] ?? 0) + 1;
    this.save();
  }

  /** 图鉴：记录获得过的装备种类 */
  recordGear(id) {
    if (!id) return;
    if (!this.codex) this.codex = { monsters: {}, gear: [] };
    if (!this.codex.gear.includes(id)) {
      this.codex.gear.push(id);
      this.save();
    }
  }

  /** 有效战力（大厅玩法用；与 Player.effectivePower 同口径，不含濒死加成） */
  get effectivePower() {
    return Math.max(1, this.power + (this.weapon?.power ?? 0) - this.curses * 2);
  }

  get bagFree() {
    return this.inventory.length < this.inventorySize;
  }

  changeGold(delta) {
    this.gold = Math.max(0, this.gold + delta);
    this.save();
  }

  /** 大厅内获得装备：空槽装备 / 入背包 / 满则按售价折算。返回处理方式 */
  giveGear(kind, item) {
    this.recordGear(item.id);
    const slot = kind === 'weapon' ? this.weapon : this.armor;
    if (!slot) {
      if (kind === 'weapon') this.weapon = item;
      else this.armor = item;
      this.save();
      return 'equipped';
    }
    if (this.bagFree) {
      this.inventory.push({ kind, item });
      this.save();
      return 'bagged';
    }
    this.changeGold(this.sellPrice(item));
    return 'sold';
  }

  sellPrice(item) {
    return Math.max(2, Math.floor((item.price ?? 10) * 0.7));
  }
}
