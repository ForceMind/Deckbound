/**
 * Meta Progress —— 跨局保留的进度（localStorage）。
 * 死亡丢失局内一切，但保留：最高层数、Boss 击杀数、解锁职业、总局数。
 */
const KEY = 'deckbound_meta_v1';

const DEFAULT_META = {
  bestFloor: 0,
  totalRuns: 0,
  totalKills: 0,
  bossKills: 0,
  wins: 0,
  unlockedClasses: [],
};

export class SaveMeta {
  constructor() {
    this.meta = this._load();
  }

  _load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? { ...DEFAULT_META, ...JSON.parse(raw) } : { ...DEFAULT_META };
    } catch {
      return { ...DEFAULT_META };
    }
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.meta));
    } catch { /* 隐私模式等场景下静默失败 */ }
  }

  /**
   * 一局结束时结算，返回本次新解锁的职业 id 列表。
   */
  recordRun({ floor, kills, bossKills, won }, config, classes) {
    this.meta.totalRuns += 1;
    this.meta.totalKills += kills;
    this.meta.bossKills += bossKills;
    if (won) this.meta.wins += 1;
    if (floor > this.meta.bestFloor) this.meta.bestFloor = floor;

    const newly = [];
    const tryUnlock = (id, cond) => {
      if (cond && !this.meta.unlockedClasses.includes(id) && classes.some((c) => c.id === id)) {
        this.meta.unlockedClasses.push(id);
        newly.push(id);
      }
    };
    tryUnlock('berserker', floor >= config.meta.unlockFloorBerserker);
    tryUnlock('necromancer', this.meta.bossKills >= config.meta.unlockBossKillsNecromancer);

    this.save();
    return newly;
  }

  isClassUnlocked(cls) {
    return cls.unlocked || this.meta.unlockedClasses.includes(cls.id);
  }
}
