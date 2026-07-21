/**
 * 成就系统 —— 条件谓词按 id 映射，达成时发奖励金币并持久保存。
 * 新成就：achievements.json 加一条 + 此处补一个谓词。
 */
const CONDS = {
  first_blood: (h) => (h.stats?.kills ?? 0) >= 1,
  kills50: (h) => (h.stats?.kills ?? 0) >= 50,
  boss5: (h) => (h.stats?.bossKills ?? 0) >= 5,
  floor10: (h) => (h.stats?.deepestFloor ?? 0) >= 10,
  floor25: (h) => (h.stats?.deepestFloor ?? 0) >= 25,
  throne: (h) => (h.stats?.throneWins ?? 0) >= 1,
  level10: (h) => (h.level ?? 1) >= 10,
  rich: (h) => (h.gold ?? 0) >= 500,
  relic3: (h) => (h.relics ?? []).length >= 3,
  crit10: (h) => (h.stats?.crits ?? 0) >= 10,
  arena5: (h) => (h.arenaWins ?? 0) >= 5,
  tower10: (h) => (h.towerBest ?? 0) >= 10,
};

/**
 * 检查并结算新达成的成就。
 * @param notify (achievement) => void 达成提示回调
 * @returns 本次新达成的成就列表
 */
export function checkAchievements(hero, defs, notify) {
  if (!hero.achievements) hero.achievements = [];
  const newly = [];
  for (const def of defs) {
    if (hero.achievements.includes(def.id)) continue;
    if (CONDS[def.id]?.(hero)) {
      hero.achievements.push(def.id);
      hero.gold += def.reward;
      newly.push(def);
    }
  }
  if (newly.length) {
    hero.save();
    for (const a of newly) notify?.(a);
  }
  return newly;
}
