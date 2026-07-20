/**
 * 自动战斗 —— 纯战力对比，不做 HP+ATK 回合制模拟。
 * 点击怪物立即开战，结果由战力决定；败北按战力差扣血（护甲减免）。
 * 只负责计算，动画与结算应用由 CombatView / Game 完成。
 */
export class Combat {
  constructor(config, rng) {
    this.cfg = config.combat;
    this.rng = rng;
  }

  /**
   * @returns {{ win, crit, playerPower, monsterPower, powerGain, goldGain, damage, tier }}
   */
  resolve(player, card) {
    const tier = card.data.tier ?? (card.data.mirror ? 'mirror' : 'monster');

    // 镜像玩家：战力取自玩家自身（±2 浮动），这是最危险的对手
    const monsterPower = card.data.mirror
      ? Math.max(1, player.effectivePower + this.rng.int(-1, 2))
      : card.power;

    let playerPower = player.effectivePower;
    const crit = this.rng.chance(player.critChance);
    if (crit) playerPower = Math.round(playerPower * this.cfg.critMultiplier);

    const win = playerPower >= monsterPower;

    const powerGain = win ? (this.cfg.powerGain[tier] ?? this.cfg.powerGain.monster) + (player.killBonus ?? 0) : 0;
    const goldRange = this.cfg.goldReward[tier] ?? this.cfg.goldReward.monster;
    const goldGain = win ? this.rng.int(goldRange[0], goldRange[1]) : 0;

    const damage = win
      ? 0
      : Math.max(1, this.cfg.defeatDamageBase + (monsterPower - playerPower) - player.block);

    return { win, crit, playerPower, monsterPower, powerGain, goldGain, damage, tier };
  }
}
