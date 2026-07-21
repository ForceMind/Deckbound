/**
 * 自动战斗 —— 纯战力对比，不做 HP+ATK 回合制模拟。
 * 点击怪物立即开战，结果由战力决定；败北按战力差扣血（护甲减免）。
 * 只负责计算，动画与结算应用由 CombatView / Game 完成。
 */
export class Combat {
  constructor(config, rng) {
    this.cfg = config.combat;
    this.expCfg = config.exp;
    this.rng = rng;
  }

  /**
   * @returns {{ win, crit, playerPower, monsterPower, powerGain, goldGain, expGain, damage, tier }}
   */
  resolve(player, card) {
    const tier = card.data.tier ?? (card.data.mirror ? 'mirror' : 'monster');

    // 镜像玩家：战力取自玩家自身（±2 浮动），这是最危险的对手
    // 神器·镜之碎片：镜像战力永远比你低 2
    const monsterPower = card.data.mirror
      ? Math.max(1, player.hasRelic?.('mirror_shard')
          ? player.effectivePower - 2
          : player.effectivePower + this.rng.int(-1, 2))
      : card.power;

    let playerPower = player.effectivePower;
    const crit = this.rng.chance(player.critChance);
    if (crit) playerPower = Math.round(playerPower * this.cfg.critMultiplier);

    const win = playerPower >= monsterPower;

    // 战力奖励随敌人强度浮动：层级基础值 + 敌方战力/15；暴击（完美击杀）额外 +1
    const powerGain = win
      ? (this.cfg.powerGain[tier] ?? this.cfg.powerGain.monster)
        + Math.floor(monsterPower / this.cfg.powerGainStrengthDiv)
        + (player.killBonus ?? 0)
        + (crit ? this.cfg.critPowerBonus : 0)
      : 0;

    // 经验 = 敌方战力 × 层级系数；暴击 ×1.5
    const expCfg = this.expCfg ?? {};
    const tierMult = expCfg.tierMult?.[tier] ?? 1;
    // 神器·猎手号角：击杀经验 +25%
    const relicExpMult = player.hasRelic?.('hunter_horn') ? 1.25 : 1;
    const expGain = win
      ? Math.ceil(monsterPower * tierMult * relicExpMult * (crit ? this.cfg.critExpMult : 1))
      : 0;

    const goldRange = this.cfg.goldReward[tier] ?? this.cfg.goldReward.monster;
    const goldGain = win
      ? Math.round(this.rng.int(goldRange[0], goldRange[1]) * (crit ? this.cfg.critGoldMult : 1))
      : 0;

    // 神器·血契：战败不被击退（在效果结算处），但伤害翻倍
    const bloodPact = player.hasRelic?.('blood_pact');
    const damage = win
      ? 0
      : Math.max(1, this.cfg.defeatDamageBase + (monsterPower - playerPower) - player.block) * (bloodPact ? 2 : 1);

    return { win, crit, playerPower, monsterPower, powerGain, goldGain, expGain, damage, tier, bloodPact };
  }
}
