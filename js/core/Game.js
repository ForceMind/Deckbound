import { bus } from './EventBus.js';
import { RNG } from './RNG.js';
import { t, i18n } from './I18n.js';
import { Player } from '../entities/Player.js';
import { MapGenerator } from '../map/MapGenerator.js';
import { World } from '../map/World.js';
import { WorldDrift } from '../map/WorldDrift.js';
import { Combat } from '../combat/Combat.js';
import { applyEffect } from '../combat/CardEffects.js';
import { UIManager } from '../ui/UIManager.js';
import { TutorialView } from '../ui/TutorialView.js';
import { Rival } from '../modes/Rival.js';

/**
 * 游戏主控 —— 串联移动 / 结算 / 滚动 / 演化 / 章节故事 / 休息 / 生死的完整流程。
 * 主线：穿过五个章节，抵达第 50 层「命运王座」击败最终首领即通关，之后可进入无尽模式。
 */
export class Game {
  constructor(data, saveMeta, titleView, seed, mode = 'adventure') {
    this.data = data;
    this.config = data.config;
    this.story = data.story;
    this.saveMeta = saveMeta;
    this.titleView = titleView;
    this.mode = mode;
    this.dailyDate = mode === 'daily' ? new Date().toISOString().slice(0, 10) : null;
    this.seed = seed ?? (Date.now() >>> 0);

    this.rng = new RNG(this.seed);
    this.generator = new MapGenerator(data, this.rng);
    this.combat = new Combat(this.config, this.rng);
    this.drift = new WorldDrift(this.config, data, this.rng);
    this.ui = new UIManager(this.config);

    this.busy = false;
    this.over = false;
    this.won = false;
    this.stats = { kills: 0, bossKills: 0 };
  }

  get ctx() {
    return {
      game: this,
      player: this.player,
      world: this.world,
      ui: this.ui,
      rng: this.rng,
      data: this.data,
      config: this.config,
    };
  }

  /* ============ 开局 ============ */

  async start() {
    const cls = await this._pickClass();
    this.player = new Player(this.config, cls);
    if (cls.bonus?.startWeapon) {
      const proto = this.data.weapons.find((w) => w.id === cls.bonus.startWeapon);
      if (proto) this.player.equipWeapon({ ...proto });
    }
    this.world = new World(this.config, this.generator);

    this.ui.boardView.onCardClick = (col) => this.tryMoveTo(col);
    this.ui.hud.onUseItem = (i) => this.useInventory(i);
    this.ui.bindActions({
      onRest: () => this.rest(),
      onInventory: () => this.openInventory(),
      onMap: () => this.openMap(),
      onSettings: () => this.openSettings(),
    });
    this._bindKeyboard();

    // 对战模式：召唤 AI 对手
    if (this.mode === 'versus') {
      this.rival = new Rival(this.data, (this.seed + 7777) >>> 0, t('versus.rivalName'));
      this._renderRivalBar();
    }

    this.ui.hud.renderAll(this.player, this.world.floor);
    this.ui.boardView.render(this.world, this.player, { enterFar: true });
    this.updateQuestBar();

    // 首次游玩：分步新手引导
    if (!TutorialView.isDone()) {
      await new TutorialView().run();
    }
    this.ui.toast(t('toast.runStart', { cls: cls.name }));
  }

  /** 开局随机 5 张职业牌，选择 1 张 */
  async _pickClass() {
    const pool = this.rng.shuffle(this.data.classes).slice(0, 5);
    return new Promise((resolve) => {
      const box = this.ui.modal.showRaw();
      box.innerHTML = `<h2>${t('class.pickTitle')}</h2><p>${t('class.pickHint')}</p><div class="card-pick-row"></div>`;
      const row = box.querySelector('.card-pick-row');
      for (const cls of pool) {
        const unlocked = this.saveMeta.isClassUnlocked(cls);
        const el = document.createElement('div');
        el.className = `card card-class${unlocked ? '' : ' locked'}`;
        el.innerHTML = `
          <span class="card-emoji">${cls.emoji}</span>
          <span class="card-name">${cls.name}</span>
          <span class="card-desc">${unlocked ? cls.desc : t('class.locked', { hint: cls.unlockHint })}</span>`;
        if (unlocked) {
          el.addEventListener('click', () => { this.ui.modal.hide(); resolve(cls); });
        }
        row.appendChild(el);
      }
    });
  }

  _bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (this.busy || this.over) return;
      // 模态弹窗打开时禁用地图操作
      if (!document.getElementById('modal-layer').classList.contains('hidden')) return;
      if (document.getElementById('tutorial-layer')) return;
      if (e.key === 'ArrowUp' || e.key === 'w') this.tryMoveTo(this.player.col);
      else if (e.key === 'ArrowLeft' || e.key === 'a') this.tryMoveTo(Math.max(0, this.player.col - 1));
      else if (e.key === 'ArrowRight' || e.key === 'd') this.tryMoveTo(Math.min(this.world.cols - 1, this.player.col + 1));
      else if (e.key === 'r') this.rest();
    });
  }

  /* ============ 故事 / 目标 ============ */

  chapterOf(floor) {
    return this.story.chapters.find((c) => floor >= c.from && floor <= c.to) ?? null;
  }

  updateQuestBar() {
    const floor = this.world.floor;
    const bar = document.getElementById('quest-bar');
    if (!bar) return;

    // 非主线模式各有自己的目标指引
    if (this.mode === 'endless') {
      const best = Math.max(this.saveMeta.meta.endlessBest, floor);
      bar.innerHTML = t('quest.bar', { chapter: `<b>${t('modes.endless')}</b>`, goal: t('quest.goalEndlessRun', { cur: floor, best }) });
      this.ui.stageView.setChapter('🌌', this.story.endless.name);
      return;
    }
    if (this.mode === 'daily') {
      const best = this.saveMeta.meta.dailyBest?.[this.dailyDate] ?? '—';
      bar.innerHTML = t('quest.bar', { chapter: `<b>${t('modes.daily')}</b>`, goal: t('quest.goalDaily', { date: this.dailyDate, cur: floor, best }) });
      this.ui.stageView.setChapter('📅', this.dailyDate);
      return;
    }
    if (this.mode === 'versus') {
      bar.innerHTML = t('quest.bar', {
        chapter: `<b>${t('modes.versus')}</b>`,
        goal: t('quest.goalVersus', { n: this.config.versus.targetFloor, p: floor, name: this.rival?.name ?? '', r: this.rival?.floor ?? 1 }),
      });
      this.ui.stageView.setChapter('🤖', this.rival?.name ?? '');
      return;
    }

    const ch = this.chapterOf(floor);
    if (ch) {
      const goal = ch.to >= this.story.finalFloor
        ? t('quest.goalFinal', { n: ch.to, cur: floor })
        : t('quest.goalReach', { n: ch.to, cur: floor });
      bar.innerHTML = t('quest.bar', { chapter: `<b>${t('chapter.enter', { n: ch.n, name: ch.name })}</b>`, goal });
      this.ui.stageView.setChapter(ch.emoji, ch.name);
    } else {
      bar.innerHTML = t('quest.bar', { chapter: `<b>${this.story.endless.name}</b>`, goal: t('quest.goalEndless', { cur: floor }) });
      this.ui.stageView.setChapter(this.story.endless.emoji, this.story.endless.name);
    }
  }

  /* ============ 对战模式 ============ */

  _renderRivalBar() {
    const bar = document.getElementById('rival-bar');
    if (!bar || !this.rival) return;
    bar.classList.remove('hidden');
    const r = this.rival;
    bar.innerHTML = r.dead
      ? t('rivalBarDead', { name: r.name })
      : t('rivalBar', { name: r.name, floor: r.floor, power: r.power, hp: Math.max(0, r.hp) });
  }

  /** 玩家每完成一个回合（前进/击退/休息），对手也走一步；同步检查胜负 */
  async _afterPlayerTurn() {
    if (this.mode !== 'versus' || this.over || !this.rival) return;
    // 玩家先抵达目标层：获胜
    if (this.world.floor >= this.config.versus.targetFloor) {
      await this._versusEnd(true);
      return;
    }
    if (!this.rival.dead) {
      const ev = this.rival.step();
      if (ev?.type === 'death') this.ui.toast(t('versus.rivalDied', { name: this.rival.name }));
      else if (ev?.type === 'kill' && ev.tier === 'boss') this.ui.toast(t('versus.rivalKillBoss', { name: this.rival.name }));
      this._renderRivalBar();
      if (!this.rival.dead && this.rival.floor >= this.config.versus.targetFloor) {
        await this._versusEnd(false);
        return;
      }
    }
    this.updateQuestBar();
  }

  async _versusEnd(win, reason = 'arrive') {
    if (this.over) return;
    this.over = true;
    this.saveMeta.recordVersus(win);
    const m = this.saveMeta.meta;
    const target = this.config.versus.targetFloor;
    const text = win
      ? t('versus.winText', { n: target, name: this.rival.name })
      : reason === 'dead'
        ? t('versus.loseDeadText', { name: this.rival.name })
        : t('versus.loseText', { n: target, name: this.rival.name });
    await this.ui.modal.show({
      title: win ? t('versus.winTitle') : t('versus.loseTitle'),
      bodyHTML: `<p class="story-text">${text}</p><p>${t('versus.record', { w: m.pvpWins, l: m.pvpLosses })}</p>`,
      choices: [{ label: t('over.again'), value: 0 }],
    });
    location.reload();
  }

  /** 滚动后检测章节推进：击败守关首领→章末故事；跨入新章→章首故事；50 层→通关 */
  async _checkStoryProgress(beatBoss) {
    if (this.mode !== 'adventure') return;   // 章节故事只属于主线冒险
    const floor = this.world.floor;

    if (beatBoss) {
      const endedChapter = this.story.chapters.find((c) => c.to === floor);
      if (endedChapter) {
        await this.ui.modal.show({
          title: t('chapter.enter', { n: endedChapter.n, name: endedChapter.name }),
          bodyHTML: `<p class="story-text">${endedChapter.outro}</p>`,
          choices: [{ label: t('chapter.continue'), value: 0 }],
        });
      }
      if (floor === this.story.finalFloor) {
        await this._finale();
        return;
      }
    }

    const enteringChapter = this.story.chapters.find((c) => c.from === floor + 1);
    if (enteringChapter && enteringChapter.n > 1) {
      await this.ui.modal.show({
        title: t('chapter.enter', { n: enteringChapter.n, name: enteringChapter.name }),
        bodyHTML: `<p class="story-text">${enteringChapter.intro}</p>`,
        choices: [{ label: t('chapter.continue'), value: 0 }],
      });
    } else if (floor === this.story.finalFloor && !this._endlessShown) {
      this._endlessShown = true;
      await this.ui.modal.show({
        title: this.story.endless.name,
        bodyHTML: `<p class="story-text">${this.story.endless.intro}</p>`,
        choices: [{ label: t('chapter.continue'), value: 0 }],
      });
    }
  }

  /** 第 50 层最终首领被击败：通关 */
  async _finale() {
    this.won = true;
    const picked = await this.ui.modal.show({
      title: t('over.winTitle'),
      bodyHTML: `<p class="story-text">${t('over.winText')}</p>
        <p>${t('over.summary', { floor: this.world.floor, kills: this.stats.kills, power: this.player.effectivePower })}</p>`,
      choices: [
        { label: t('chapter.finaleContinue'), value: 'endless' },
        { label: t('chapter.finaleEnd'), value: 'end' },
      ],
    });
    if (picked === 'end') {
      await this._gameOver(false, true);
    }
  }

  /* ============ 回合流程 ============ */

  /**
   * 移动到第一行的 col 列：正前方 freeRange(±1) 范围内免费，
   * 更远的每格消耗 1 体力；每前进 floorDrainInterval 层因跋涉自动消耗体力。
   */
  async tryMoveTo(col) {
    if (this.busy || this.over) return;
    const move = this.config.movement;
    const sideSteps = Math.abs(col - this.player.col);
    const cost = Math.max(0, sideSteps - move.freeRange) * move.sideCost + move.forwardCost;

    if (!this.world.nearVisibleSet(this.player.col).has(col)) {
      this.ui.toast(t('toast.tooFar'));
      return;
    }
    if (this.player.energy < cost) {
      this.ui.toast(t('toast.noEnergy', { n: cost }));
      return;
    }

    this.busy = true;
    try {
      // 1. 横向移动（超出免费范围的部分收体力）
      if (sideSteps > 0) {
        if (cost > 0) this.player.changeEnergy(-cost);
        await this.ui.boardView.animateSideStep(this.player.col, col);
        this.player.col = col;
        this.ui.boardView.render(this.world, this.player);
      }

      // 2. 向前一步
      await this.ui.boardView.animateAdvance(col, col);

      // 3. 结算目标卡
      const card = this.world.near[col];
      const beatBoss = card.type === 'boss';
      const result = await applyEffect(this.ctx, card);

      if (this.player.hp <= 0) { await this._gameOver(); return; }

      // 4a. 战败击退：留在原行（对战模式下对手照常前进）
      if (result.retreat) {
        await this.ui.boardView.animateRetreat();
        this.ui.boardView.render(this.world, this.player);
        await this._afterPlayerTurn();
        return;
      }

      // 4b. 前进成功：世界滚动（新行随滚动从顶部进入）+ 演化
      this.world.scroll();
      await this.ui.boardView.animateScroll(this.world, this.player);
      if (result.teleport) this.world.scroll();

      // 长途跋涉：每前进若干层自动消耗体力
      if (move.floorDrainInterval > 0 && this.world.floor % move.floorDrainInterval === 0) {
        this.player.changeEnergy(-move.floorDrainAmount);
        this.ui.toast(t('toast.fatigue', { n: move.floorDrainAmount }));
      }

      const changes = this.drift.apply(this.world);
      this.ui.hud.renderFloor(this.world.floor);
      this.ui.boardView.render(this.world, this.player);
      this.updateQuestBar();
      if (changes.length) {
        this.ui.boardView.animateDrift(changes);
        this.ui.toast(t('toast.drift'));
      }

      await this._checkStoryProgress(beatBoss && !result.retreat);
      if (this.over) return;
      await this._afterPlayerTurn();
      if (this.over) return;
      this._checkBossAhead();
    } finally {
      this.busy = false;
    }
  }

  /** 原地休息：恢复体力，视野内两行的牌随机挪动位置（FLIP 滑动动画） */
  async rest() {
    if (this.busy || this.over) return;
    this.busy = true;
    try {
      this.player.changeEnergy(this.config.rest.energyGain);
      if (this.player.restHeal) this.player.changeHp(this.player.restHeal);
      const oldPos = this.ui.boardView.capturePositions();
      this.world.shufflePositions();
      this.ui.boardView.render(this.world, this.player);
      this.ui.boardView.animateFlip(oldPos);
      this.ui.toast(t('toast.rest', { n: this.config.rest.energyGain }));
      await new Promise((r) => setTimeout(r, 500));
      await this._afterPlayerTurn();
    } finally {
      this.busy = false;
    }
  }

  _checkBossAhead() {
    if (this.world.far.some((c) => c.type === 'boss')) {
      this.ui.animator.screenShake();
      this.ui.toast(t('toast.bossAhead'));
    }
  }

  /* ============ 装备栏系统 ============ */

  _gearStat(kind, item) {
    return kind === 'weapon'
      ? t('hud.weaponStat', { atk: item.atk ?? 0, power: item.power ?? 0, crit: Math.round((item.crit ?? 0) * 100) })
      : t('hud.armorStat', { block: item.block ?? 0 });
  }

  /** 装备显示名带稀有度后缀（同名不同稀有度的装备不再混淆） */
  _gearName(item) {
    const r = this.data.rarities[item.rarity];
    return r && item.rarity !== 'common' ? `${item.name}（${r.name}）` : item.name;
  }

  _sellPrice(item) {
    return Math.max(2, Math.floor((item.price ?? 10) / 2));
  }

  /**
   * 拾取装备：槽位空直接装备；已有装备时弹出选择——
   * 装备新的（旧的收入背包，满则折价卖）/ 收入背包 / 折价卖出。
   */
  async acquireGear(kind, item) {
    const p = this.player;
    item.displayName = this._gearName(item);
    const slot = kind === 'weapon' ? p.weapon : p.armor;
    const equip = (it) => (kind === 'weapon' ? p.equipWeapon(it) : p.equipArmor(it));
    const equipKey = kind === 'weapon' ? 'toast.equipWeapon' : 'toast.equipArmor';

    if (!slot) {
      equip(item);
      this.ui.toast(t(equipKey, { name: item.displayName }));
      return;
    }

    const bagFree = p.inventory.length < p.inventorySize;
    const newSell = this._sellPrice(item);
    const oldSell = this._sellPrice(slot);
    const picked = await this.ui.modal.show({
      title: t('gear.title', { name: `${item.emoji} ${item.displayName}` }),
      bodyHTML: t('gear.compare', {
        newName: item.displayName,
        newStat: this._gearStat(kind, item),
        oldName: slot.displayName ?? slot.name,
        oldStat: this._gearStat(kind, slot),
      }),
      choices: [
        {
          label: t('gear.equipNew'),
          sub: bagFree
            ? t('gear.oldToBag', { name: slot.displayName ?? slot.name })
            : t('gear.oldSold', { name: slot.displayName ?? slot.name, n: oldSell }),
          value: 'equip',
        },
        { label: t('gear.toBag'), sub: bagFree ? t('gear.toBagSub') : t('gear.bagFull'), disabled: !bagFree, value: 'bag' },
        { label: t('gear.sell', { n: newSell }), value: 'sell' },
      ],
    });

    if (picked === 'equip') {
      const old = equip(item);
      if (old && !p.addItem(kind, old)) {
        p.changeGold(this._sellPrice(old));
        this.ui.toast(t('toast.gearSold', { name: old.name, n: this._sellPrice(old) }));
      }
      this.ui.toast(t(equipKey, { name: item.name }));
    } else if (picked === 'bag') {
      p.addItem(kind, item);
      this.ui.toast(t('toast.gearToBag', { name: item.name }));
    } else {
      p.changeGold(newSell);
      this.ui.toast(t('toast.gearSold', { name: item.name, n: newSell }));
    }
  }

  /** 非交互获取装备（事件奖励等场景）：槽空装备，否则入背包，满则折价卖 */
  giveGearSilent(kind, item) {
    const p = this.player;
    item.displayName = this._gearName(item);
    const slot = kind === 'weapon' ? p.weapon : p.armor;
    if (!slot) {
      kind === 'weapon' ? p.equipWeapon(item) : p.equipArmor(item);
      this.ui.toast(t(kind === 'weapon' ? 'toast.equipWeapon' : 'toast.equipArmor', { name: item.displayName }));
    } else if (p.addItem(kind, item)) {
      this.ui.toast(t('toast.gearToBag', { name: item.displayName }));
    } else {
      const n = this._sellPrice(item);
      p.changeGold(n);
      this.ui.toast(t('toast.gearSold', { name: item.displayName, n }));
    }
  }

  /* ============ 道具 ============ */

  async useInventory(index) {
    if (this.over) return;
    const entry = this.player.inventory[index];
    if (!entry) return;
    if (entry.kind === 'food') {
      this.player.removeItem(index);
      this.player.changeHp(entry.item.hp ?? 0);
      this.player.changeEnergy(entry.item.energy ?? 0);
      this.ui.toast(t('toast.eat', { name: entry.item.name, hp: entry.item.hp, energy: entry.item.energy }));
    } else if (entry.kind === 'potion') {
      this.player.removeItem(index);
      this.drinkPotion();
    } else if (entry.kind === 'weapon' || entry.kind === 'armor') {
      // 装备管理：换上 / 折价卖出
      const sell = this._sellPrice(entry.item);
      const picked = await this.ui.modal.show({
        title: `${entry.item.emoji} ${entry.item.name}`,
        bodyHTML: `<p>${this._gearStat(entry.kind, entry.item)}</p>`,
        choices: [
          { label: t('inv.equip'), value: 'equip' },
          { label: t('inv.sell', { n: sell }), value: 'sell' },
          { label: t('inv.close'), value: 'cancel' },
        ],
      });
      if (picked === 'equip') {
        // 与身上的装备互换（刚腾出的背包位正好放旧装备）
        this.player.removeItem(index);
        const old = entry.kind === 'weapon'
          ? this.player.equipWeapon(entry.item)
          : this.player.equipArmor(entry.item);
        if (old) this.player.addItem(entry.kind, old);
        this.ui.toast(t('toast.swapped', { name: entry.item.name }));
      } else if (picked === 'sell') {
        this.player.removeItem(index);
        this.player.changeGold(sell);
        this.ui.toast(t('toast.gearSold', { name: entry.item.name, n: sell }));
      }
    } else if (entry.kind === 'key') {
      this.ui.toast(t('toast.keepKey'));
    }
  }

  /** 喝药水：随机效果 */
  drinkPotion() {
    const effect = this.rng.weighted(this.data.items.potionEffects);
    if (effect.hp) this.player.changeHp(effect.hp);
    if (effect.power) this.player.changePower(effect.power);
    if (effect.energy) this.player.changeEnergy(effect.energy);
    if (effect.atk) this.player.changeAtk(effect.atk);
    if (effect.maxHp) this.player.changeMaxHp(effect.maxHp);
    this.ui.toast(t('toast.potionEffect', { text: effect.text }));
    if (this.player.hp <= 0) this._gameOver();
  }

  /* ============ 底栏面板 ============ */

  /** @param fromShop 商店内嵌打开时跳过 busy 检查（商店流程中 busy 恒为 true） */
  async openInventory(fromShop = false) {
    if (!fromShop && (this.busy || this.over)) return;
    const p = this.player;
    const items = p.inventory.map((e, i) => ({
      label: `${e.item.emoji} ${e.item.displayName ?? e.item.name}`,
      sub: this._invSub(e),
      value: i,
    }));
    const picked = await this.ui.modal.show({
      title: t('inv.title'),
      bodyHTML: `<p>${items.length ? t('inv.hint') : t('inv.emptyHint')}</p>`,
      choices: [...items, { label: t('inv.close'), value: -1 }],
    });
    if (picked >= 0) await this.useInventory(picked);   // 等处理链走完（装备弹窗）再返回，商店流程依赖此顺序
  }

  _invSub(entry) {
    if (entry.kind === 'food') return t('inv.foodSub', { hp: entry.item.hp, energy: entry.item.energy });
    if (entry.kind === 'potion') return t('inv.potionSub');
    if (entry.kind === 'weapon' || entry.kind === 'armor') return this._gearStat(entry.kind, entry.item);
    return t('inv.keySub');
  }

  async openMap() {
    if (this.busy || this.over) return;
    const m = this.saveMeta.meta;
    const nextBoss = Math.ceil((this.world.floor + 1) / this.config.boss.interval) * this.config.boss.interval;
    await this.ui.modal.show({
      title: t('map.title'),
      bodyHTML: `
        <p>${t('map.current', { floor: this.world.floor, kills: this.stats.kills, boss: this.stats.bossKills })}</p>
        <p>${t('map.history', { best: Math.max(m.bestFloor, this.world.floor), runs: m.totalRuns, bossTotal: m.bossKills, wins: m.wins ?? 0 })}</p>
        <p>${t('map.nextBoss', { n: nextBoss })}</p>`,
      choices: [{ label: t('map.continue'), value: 0 }],
    });
  }

  async openSettings() {
    if (this.busy || this.over) return;
    const picked = await this.ui.modal.show({
      title: t('settings.title'),
      bodyHTML: `<p>${t('settings.seed', { seed: this.seed })}</p>`,
      choices: [
        { label: t('settings.back'), value: 'back' },
        { label: t('settings.language'), sub: t('settings.languageSub'), value: 'lang' },
        { label: t('settings.howto'), value: 'howto' },
        { label: t('settings.replayTutorial'), value: 'tutorial' },
        { label: t('settings.restart'), sub: t('settings.restartSub'), value: 'restart' },
      ],
    });
    if (picked === 'lang') {
      await i18n.setLang(i18n.otherLang);
      this._refreshLanguage();
    } else if (picked === 'howto') {
      await this.titleView.showHowto();
    } else if (picked === 'tutorial') {
      await new TutorialView().run();
    } else if (picked === 'restart') {
      await this._gameOver(true);
    }
  }

  /** 语言切换后无损刷新所有 UI（不重开本局） */
  _refreshLanguage() {
    i18n.applyStatic();
    this.ui.hud.renderAll(this.player, this.world.floor);
    this.ui.boardView.render(this.world, this.player);
    this.updateQuestBar();
    this.ui.toast(t('settings.langChanged'));
  }

  /* ============ 结束 ============ */

  async _gameOver(abandoned = false, won = false) {
    if (this.over) return;
    // 对战模式的死亡/放弃走竞速结算
    if (this.mode === 'versus') {
      await this._versusEnd(false, 'dead');
      return;
    }
    this.over = true;
    const floor = this.world.floor;
    const newlyUnlocked = this.saveMeta.recordRun(
      { floor, kills: this.stats.kills, bossKills: this.stats.bossKills, won: won || this.won, mode: this.mode, dailyDate: this.dailyDate },
      this.config, this.data.classes,
    );

    if (!abandoned && !won) this.ui.animator.screenShake();
    const unlockHtml = newlyUnlocked.length
      ? `<p style="color:var(--gold)">${t('over.unlock', { names: newlyUnlocked.map((id) => this.data.classes.find((c) => c.id === id)?.name).join('、') })}</p>`
      : '';
    const title = won ? t('over.winTitle') : abandoned ? t('over.abandonTitle') : t('over.deathTitle');
    const flavor = won ? t('over.winText') : t('over.deathText');
    await this.ui.modal.show({
      title,
      bodyHTML: `
        <p>${t('over.summary', { floor, kills: this.stats.kills, power: this.player.effectivePower })}</p>
        ${unlockHtml}
        <p>${flavor}</p>`,
      choices: [{ label: t('over.again'), value: 0 }],
    });
    location.reload();
  }
}

// bus 目前由各模块直接引用；导出以便调试
export { bus };
