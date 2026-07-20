/**
 * 可播种随机数生成器（mulberry32）。
 * 支持 seed 是为后续「每日挑战 / 赛季」预留 —— 同一 seed 生成同一世界。
 */
export class RNG {
  constructor(seed = Date.now() >>> 0) {
    this.seed = seed >>> 0;
    this._state = this.seed;
  }

  /** [0, 1) */
  next() {
    this._state |= 0;
    this._state = (this._state + 0x6d2b79f5) | 0;
    let t = Math.imul(this._state ^ (this._state >>> 15), 1 | this._state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [min, max] 整数 */
  int(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /** 概率判定 */
  chance(p) {
    return this.next() < p;
  }

  /** 从数组随机取一个 */
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /**
   * 加权随机：weights 为 { key: weight } 或 [{...item, weight}]。
   * 返回选中的 key 或 item。
   */
  weighted(weights) {
    if (Array.isArray(weights)) {
      const total = weights.reduce((s, w) => s + (w.weight ?? 1), 0);
      let roll = this.next() * total;
      for (const item of weights) {
        roll -= item.weight ?? 1;
        if (roll <= 0) return item;
      }
      return weights[weights.length - 1];
    }
    const entries = Object.entries(weights).filter(([, w]) => w > 0);
    const total = entries.reduce((s, [, w]) => s + w, 0);
    let roll = this.next() * total;
    for (const [key, w] of entries) {
      roll -= w;
      if (roll <= 0) return key;
    }
    return entries[entries.length - 1]?.[0];
  }

  /** Fisher-Yates 洗牌（返回新数组） */
  shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}
