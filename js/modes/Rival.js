import { RNG } from '../core/RNG.js';
import { MapGenerator } from '../map/MapGenerator.js';
import { World } from '../map/World.js';

/**
 * 对战模式 AI 对手 —— 在自己的牌阵上真实模拟回合决策（假 AI，为将来真人 PVP 预留接口）。
 * 每回合：评估可达的牌 → 选收益最高的一张 → 结算（战斗/拾取/恢复）→ 前进或休息。
 * 数值模型与玩家一致（初始属性 / 战力成长 / 跋涉消耗），装备简化为直接加战力。
 */
export class Rival {
  constructor(data, seed, name) {
    this.data = data;
    this.config = data.config;
    this.name = name;
    this.rng = new RNG(seed);
    this.gen = new MapGenerator(data, this.rng);
    this.world = new World(this.config, this.gen);

    const p = this.config.player;
    this.hp = p.hp;
    this.maxHp = p.maxHp;
    this.power = p.power;
    this.energy = p.energy;
    this.maxEnergy = p.maxEnergy;
    this.exp = 0;
    this.level = 1;
    this.dead = false;
    this.centerCol = Math.floor(this.config.grid.cols / 2);
  }

  get expToNext() {
    const c = this.config.exp;
    return Math.round(c.baseToNext * Math.pow(c.growth, this.level - 1));
  }

  /** 与玩家同曲线的经验升级（AI 镜像模型） */
  addExp(n) {
    this.exp += n;
    const c = this.config.exp;
    while (this.exp >= this.expToNext) {
      this.exp -= this.expToNext;
      this.level += 1;
      this.maxHp += c.levelUp.maxHp;
      this.hp = Math.min(this.maxHp, this.hp + c.levelUp.maxHp);
      this.power += c.levelUp.power ?? 0;
    }
  }

  get floor() {
    return this.world.floor;
  }

  /** 走一个回合，返回事件描述（供 UI 提示关键事件） */
  step() {
    if (this.dead) return null;
    // 平衡性：AI 偶尔犹豫原地不动，给玩家追赶的机会
    if (this.rng.chance(0.15)) return { type: 'idle' };
    const move = this.config.movement;

    // 决策：挑可负担的最优目标
    const vis = [...this.world.nearVisibleSet(this.centerCol)];
    let best = null;
    let bestScore = -Infinity;
    for (const c of vis) {
      const card = this.world.near[c];
      if (card.type === 'barrier') continue;   // 结界不可通行
      const cost = Math.max(0, Math.abs(c - this.centerCol) - move.freeRange) * move.sideCost;
      if (cost > this.energy) continue;
      const score = this._score(card) - cost * 2 + this.rng.next() * 2;   // 少量噪声：AI 也会犯错
      if (score > bestScore) { bestScore = score; best = c; }
    }

    // 无路可走或前路太凶险且体力未满：原地休息（与玩家规则一致，牌挪位置）
    if (best === null || (bestScore < -4 && this.energy < this.maxEnergy)) {
      this.energy = Math.min(this.maxEnergy, this.energy + this.config.rest.energyGain);
      this.world.shufflePositions();
      return { type: 'rest' };
    }

    const card = this.world.near[best];
    this.energy -= Math.max(0, Math.abs(best - this.centerCol) - move.freeRange) * move.sideCost;
    const ev = this._resolve(card);

    if (this.hp <= 0) {
      this.dead = true;
      return { type: 'death' };
    }
    if (!ev.retreat) {
      this.world.scroll();
      if (ev.teleport) this.world.scroll();
      if (move.floorDrainInterval > 0 && this.world.floor % move.floorDrainInterval === 0) {
        this.energy = Math.max(0, this.energy - move.floorDrainAmount);
      }
    }
    return ev;
  }

  _score(card) {
    switch (card.type) {
      case 'monster': case 'elite': case 'boss': case 'mirror': {
        const enemyPower = card.data.mirror ? this.power : card.power;
        const diff = this.power - enemyPower;
        return diff >= 0 ? 8 + Math.min(diff, 6) : diff * 3;
      }
      case 'campfire': return this.hp < this.maxHp * 0.6 ? 10 : 4;
      case 'spring': return this.energy < this.maxEnergy * 0.5 ? 9 : 3;
      case 'food': return 6;
      case 'treasure': return 7;
      case 'blessing': return 6;
      case 'weapon': case 'armor': return 6;
      case 'gold': return 5;
      case 'teleport': return 5;
      case 'potion': return 4;
      case 'chest': return 4;
      case 'key': return 3;
      case 'empty': return 2;
      case 'event': case 'merchant': case 'door': return 1;
      case 'trap': return -4;
      case 'fire': return -5;
      case 'curse': return -6;
      default: return 0;
    }
  }

  _resolve(card) {
    const cfg = this.config.combat;
    switch (card.type) {
      case 'monster': case 'elite': case 'boss': case 'mirror': {
        const tier = card.data.tier ?? (card.data.mirror ? 'mirror' : 'monster');
        const enemyPower = card.data.mirror ? Math.max(1, this.power + this.rng.int(-1, 2)) : card.power;
        if (this.power >= enemyPower) {
          // 经验驱动：击杀给经验，战力由升级提供
          const tierMult = this.config.exp.tierMult[tier] ?? 1;
          this.addExp(Math.ceil(enemyPower * tierMult));
          return { type: 'kill', tier, name: card.name };
        }
        this.hp -= Math.max(1, cfg.defeatDamageBase + (enemyPower - this.power));
        return { type: 'hurt', retreat: true };
      }
      case 'food': this.hp = Math.min(this.maxHp, this.hp + (card.data.hp ?? 4)); this.energy = Math.min(this.maxEnergy, this.energy + (card.data.energy ?? 1)); break;
      case 'campfire': this.hp = Math.min(this.maxHp, this.hp + 6); this.energy = Math.min(this.maxEnergy, this.energy + 2); break;
      case 'spring': this.energy = Math.min(this.maxEnergy, this.energy + this.rng.int(2, 4)); break;
      case 'weapon': case 'armor': this.power += this.rng.int(1, 3); break;
      case 'blessing': this.power += 1; this.hp = Math.min(this.maxHp, this.hp + 4); break;
      case 'shrine': this.power += 2; break;
      case 'potion': this.hp = Math.min(this.maxHp, this.hp + 6); break;
      case 'curse': this.power = Math.max(1, this.power - 2); break;
      case 'trap': this.hp -= this.rng.int(3, 6); break;
      case 'fire': this.hp -= this.rng.int(4, 8); break;
      case 'teleport': return { type: 'move', teleport: true };
      default: break;
    }
    return { type: 'move' };
  }
}
