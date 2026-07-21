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
  resolve(player, card, opts = {}) {
    const tier = card.data.tier ?? (card.data.mirror ? 'mirror' : 'monster');

    // 镜像玩家：战力取自玩家自身（±2 浮动），这是最危险的对手
    // 神器·镜之碎片：镜像战力永远比你低 2
    let monsterPower = card.data.mirror
      ? Math.max(1, player.hasRelic?.('mirror_shard')
          ? player.effectivePower - 2
          : player.effectivePower + this.rng.int(-1, 2))
      : card.power;
    // 天气·血月：怪物战力 +10%
    if (opts.weather === 'moon') monsterPower = Math.round(monsterPower * 1.1);

    let playerPower = player.effectivePower;
    // 技能·狂暴：本次战斗战力 +50%
    if (player.skillFlags?.rage) {
      playerPower = Math.round(playerPower * 1.5);
      delete player.skillFlags.rage;
    }
    // 首领技能·深渊威压：本次战斗玩家战力 -10%
    if (opts.bossSkill === 'terror') playerPower = Math.max(1, Math.round(playerPower * 0.9));
    // 技能·处决：本次战斗必定暴击
    let crit;
    if (player.skillFlags?.execute) {
      crit = true;
      delete player.skillFlags.execute;
    } else {
      crit = this.rng.chance(player.critChance);
    }
    // 首领技能·岿然不动：无法暴击
    if (opts.bossSkill === 'immovable') crit = false;
    if (crit) playerPower = Math.round(playerPower * this.cfg.critMultiplier);

    const win = playerPower >= monsterPower;

    // 经验驱动成长：击杀只给经验（战力由升级/装备/神器提供）。
    // 经验 = 敌方战力 × 层级系数；暴击 ×1.5；死灵法师与猎手号角有加成
    const expCfg = this.expCfg ?? {};
    const tierMult = expCfg.tierMult?.[tier] ?? 1;
    const relicExpMult = player.hasRelic?.('hunter_horn') ? 1.25 : 1;
    const classExpMult = 1 + (player.killExpBonus ?? 0);
    const expGain = win
      ? Math.ceil(monsterPower * tierMult * relicExpMult * classExpMult * (crit ? this.cfg.critExpMult : 1))
      : 0;

    const goldRange = this.cfg.goldReward[tier] ?? this.cfg.goldReward.monster;
    // 天气·血月：击杀金币 +50%
    const moonGold = opts.weather === 'moon' ? 1.5 : 1;
    const goldGain = win
      ? Math.round(this.rng.int(goldRange[0], goldRange[1]) * (crit ? this.cfg.critGoldMult : 1) * moonGold)
      : 0;

    // 神器·血契：战败不被击退（在效果结算处），但伤害翻倍
    const bloodPact = player.hasRelic?.('blood_pact');
    const damage = win
      ? 0
      : Math.max(1, this.cfg.defeatDamageBase + (monsterPower - playerPower) - player.block) * (bloodPact ? 2 : 1);

    return { win, crit, playerPower, monsterPower, goldGain, expGain, damage, tier, bloodPact };
  }
}
