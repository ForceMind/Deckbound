import { Card } from '../entities/Card.js';

/**
 * 世界演化（核心特色机制）—— 牌阵不是静态的，每回合它自己也在变化：
 * - 怪物会游荡（与相邻的牌换位）
 * - 商人会离开
 * - 宝箱会被其他冒险者打开
 * - 火焰会蔓延，吞噬相邻的牌
 * - 诅咒会扩散
 * 返回变化列表供 UI 播放动画。
 */
export class WorldDrift {
  constructor(config, data, rng) {
    this.cfg = config.drift;
    this.data = data;
    this.rng = rng;
  }

  /**
   * 对世界应用一次演化。
   * @returns {Array<{row, col, kind}>} 发生变化的格子（kind: wander/leave/looted/spread）
   */
  apply(world, weatherId = null) {
    const changes = [];
    for (const rowKey of ['near', 'far']) {
      const row = rowKey === 'near' ? world.near : world.far;
      this._driftRow(row, rowKey, changes, weatherId);
    }
    return changes;
  }

  _driftRow(row, rowKey, changes, weatherId) {
    // 1. 怪物游荡：随机一只怪与相邻格换位（不吃掉 Boss / 商人）
    const monsterCols = row
      .map((c, i) => (c.type === 'monster' || c.type === 'elite' ? i : -1))
      .filter((i) => i >= 0);
    if (monsterCols.length && this.rng.chance(this.cfg.monsterWanderChance)) {
      const col = this.rng.pick(monsterCols);
      const dir = this.rng.chance(0.5) ? -1 : 1;
      const target = col + dir;
      if (target >= 0 && target < row.length && !['boss', 'merchant', 'door'].includes(row[target].type)) {
        [row[col], row[target]] = [row[target], row[col]];
        changes.push({ row: rowKey, col, kind: 'wander' }, { row: rowKey, col: target, kind: 'wander' });
      }
    }

    row.forEach((card, col) => {
      // 2. 商人离开
      if (card.type === 'merchant' && this.rng.chance(this.cfg.merchantLeaveChance)) {
        row[col] = this._empty('商人已离开');
        changes.push({ row: rowKey, col, kind: 'leave' });
        return;
      }
      // 3. 宝箱被其他冒险者打开
      if (card.type === 'chest' && this.rng.chance(this.cfg.chestLootedChance)) {
        row[col] = new Card('empty', { name: '被撬开的箱子', emoji: '🥡', data: { looted: true } });
        changes.push({ row: rowKey, col, kind: 'looted' });
        return;
      }
      // 4. 火焰蔓延到相邻格（不烧敌人和特殊牌；雨天不蔓延）
      if (card.type === 'fire' && weatherId !== 'rain' && this.rng.chance(this.cfg.fireSpreadChance)) {
        const target = col + (this.rng.chance(0.5) ? -1 : 1);
        const victim = row[target];
        if (victim && ['food', 'empty', 'trap', 'gold'].includes(victim.type)) {
          row[target] = new Card('fire', { name: '火焰', emoji: '🔥', data: {} });
          changes.push({ row: rowKey, col: target, kind: 'spread' });
        }
        return;
      }
      // 5. 诅咒扩散
      if (card.type === 'curse' && this.rng.chance(this.cfg.curseSpreadChance)) {
        const target = col + (this.rng.chance(0.5) ? -1 : 1);
        const victim = row[target];
        if (victim && ['empty', 'gold', 'food', 'blessing'].includes(victim.type)) {
          row[target] = new Card('curse', { name: '诅咒', emoji: '💀', data: {} });
          changes.push({ row: rowKey, col: target, kind: 'spread' });
        }
      }
    });
  }

  _empty(name) {
    return new Card('empty', { name, emoji: '🌫️', data: {} });
  }
}
