import { bus } from '../core/EventBus.js';

/**
 * 玩家实体 —— 属性、装备、背包、职业加成。
 * 所有属性变化都通过方法修改并广播 statsChanged，UI 只做被动渲染。
 */
export class Player {
  /**
   * @param heroState 持久角色数据（冒险主世界）；为空时用基础值 + 职业加成（经典挑战）
   */
  constructor(config, playerClass, heroState = null) {
    const base = config.player;
    this.maxHp = base.maxHp;
    this.hp = base.hp;
    this.atk = base.atk;
    this.power = base.power;
    this.maxEnergy = base.maxEnergy;
    this.energy = base.energy;
    this.gold = base.gold;
    this.inventorySize = base.inventorySize;

    this.col = config.grid.playerStartCol;
    this.weapon = null;
    this.armor = null;
    this.inventory = [];   // { kind: 'food'|'potion'|'key'|'weapon'|'armor', item }
    this.curses = 0;
    this.buffs = [];       // 文本记录，用于侧栏展示

    this.playerClass = playerClass;
    this._applyClassTraits(playerClass);

    if (heroState) {
      // 持久角色进入冒险：属性/装备/背包/金币全部继承，满状态出发
      this.maxHp = heroState.maxHp;
      this.hp = heroState.maxHp;
      this.atk = heroState.atk;
      this.power = heroState.power;
      this.gold = heroState.gold;
      this.inventorySize = heroState.inventorySize;
      this.weapon = heroState.weapon ? { ...heroState.weapon } : null;
      this.armor = heroState.armor ? { ...heroState.armor } : null;
      this.inventory = (heroState.inventory ?? []).map((e) => ({ ...e, item: { ...e.item } }));
      this.curses = heroState.curses ?? 0;
    } else {
      this._applyClassStats(playerClass);
    }
  }

  /** 职业特性（暴击/休整/击杀加成/狂化）——持久角色也要生效 */
  _applyClassTraits(cls) {
    const b = cls?.bonus ?? {};
    this.classCrit = b.crit ?? 0;
    this.restHeal = b.restHeal ?? 0;
    this.killBonus = b.killBonus ?? 0;
    this.berserk = !!b.berserk;
  }

  /** 职业属性加成（仅无持久角色数据时应用，持久角色已在创建时计入） */
  _applyClassStats(cls) {
    const b = cls?.bonus ?? {};
    this.maxHp += b.maxHp ?? 0;
    this.hp += b.hp ?? 0;
    this.atk += b.atk ?? 0;
    this.power += b.power ?? 0;
  }

  /** 有效战力 = 基础战力 + 武器加成 - 诅咒惩罚 (+ 狂战士低血加成) */
  get effectivePower() {
    let p = this.power + (this.weapon?.power ?? 0) - this.curses * 2;
    if (this.berserk) {
      const missing = 1 - this.hp / this.maxHp;
      p += Math.floor(missing * 6);
    }
    return Math.max(1, p);
  }

  get critChance() {
    return (this.weapon?.crit ?? 0) + (this.classCrit ?? 0);
  }

  get block() {
    return this.armor?.block ?? 0;
  }

  changeHp(delta) {
    this.hp = Math.min(this.maxHp, this.hp + delta);
    bus.emit('statsChanged', this);
    if (delta < 0) bus.emit('playerHurt', -delta);
    return this.hp > 0;
  }

  changeEnergy(delta) {
    this.energy = Math.max(0, Math.min(this.maxEnergy, this.energy + delta));
    bus.emit('statsChanged', this);
  }

  changeGold(delta) {
    this.gold = Math.max(0, this.gold + delta);
    bus.emit('statsChanged', this);
    if (delta > 0) bus.emit('goldGained', delta);
  }

  changePower(delta) {
    this.power = Math.max(1, this.power + delta);
    bus.emit('statsChanged', this);
    if (delta > 0) bus.emit('powerGained', delta);
  }

  changeAtk(delta) {
    this.atk = Math.max(0, this.atk + delta);
    bus.emit('statsChanged', this);
  }

  changeMaxHp(delta) {
    this.maxHp = Math.max(1, this.maxHp + delta);
    this.hp = Math.min(this.hp, this.maxHp);
    bus.emit('statsChanged', this);
  }

  equipWeapon(weapon) {
    const old = this.weapon;
    this.weapon = weapon;
    bus.emit('equipChanged', this);
    bus.emit('statsChanged', this);
    return old;
  }

  equipArmor(armor) {
    const old = this.armor;
    if (old) this.changeMaxHp(-(old.hp ?? 0));
    this.armor = armor;
    this.changeMaxHp(armor.hp ?? 0);
    this.hp = Math.min(this.maxHp, this.hp + (armor.hp ?? 0));
    bus.emit('equipChanged', this);
    bus.emit('statsChanged', this);
    return old;
  }

  addItem(kind, item) {
    if (this.inventory.length >= this.inventorySize) return false;
    this.inventory.push({ kind, item });
    bus.emit('inventoryChanged', this);
    return true;
  }

  removeItem(index) {
    const [entry] = this.inventory.splice(index, 1);
    bus.emit('inventoryChanged', this);
    return entry;
  }

  hasKey() {
    return this.inventory.some((e) => e.kind === 'key');
  }

  consumeKey() {
    const i = this.inventory.findIndex((e) => e.kind === 'key');
    if (i >= 0) this.removeItem(i);
    return i >= 0;
  }

  addCurse() {
    this.curses += 1;
    bus.emit('statsChanged', this);
    bus.emit('inventoryChanged', this);
  }

  removeCurse() {
    if (this.curses > 0) {
      this.curses -= 1;
      bus.emit('statsChanged', this);
      bus.emit('inventoryChanged', this);
      return true;
    }
    return false;
  }

  addBuff(text, isCurse = false) {
    this.buffs.push({ text, isCurse });
    bus.emit('inventoryChanged', this);
  }
}
