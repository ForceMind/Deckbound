import { t, i18n } from '../core/I18n.js';
import { Arena } from './Arena.js';
import { Auction } from './Auction.js';
import { Tower } from './Tower.js';
import { Hunt } from './Hunt.js';
import { Casino } from './Casino.js';
import { Wish } from './Wish.js';
import { Hero } from '../core/Hero.js';
import { gearStat } from '../core/GearFactory.js';
import { checkAchievements } from '../core/Achievements.js';
import { sound } from '../core/Sound.js';
import { CombatView } from '../ui/CombatView.js';

/**
 * 首次创建角色：命运发五张职业牌选一张
 */
export function pickClass(modal, classes, saveMeta, rng) {
  const pool = rng.shuffle(classes).slice(0, 5);
  return new Promise((resolve) => {
    const box = modal.showRaw();
    box.innerHTML = `<h2>${t('class.pickTitle')}</h2><p>${t('class.pickHint')}</p><div class="card-pick-row"></div>`;
    const row = box.querySelector('.card-pick-row');
    for (const cls of pool) {
      const unlocked = saveMeta.isClassUnlocked(cls);
      const el = document.createElement('div');
      el.className = `card card-class${unlocked ? '' : ' locked'}`;
      el.innerHTML = `
        <span class="card-emoji">${cls.emoji}</span>
        <span class="card-name">${cls.name}</span>
        <span class="card-desc">${unlocked ? cls.desc : t('class.locked', { hint: cls.unlockHint })}</span>`;
      if (unlocked) {
        el.addEventListener('click', () => { modal.hide(); resolve(cls); });
      }
      row.appendChild(el);
    }
  });
}

/**
 * 🏰 大厅 —— 持久角色的家。冒险主世界负责养成，
 * 竞技场 / 拍卖行 / 试炼塔 / 首领狩猎 / 赌坊 / 祈愿池 / 经典挑战都在这里入口。
 */
export class Hub {
  constructor(data, hero, saveMeta, modal, rng) {
    this.data = data;
    this.config = data.config;
    this.hero = hero;
    this.saveMeta = saveMeta;
    this.modal = modal;
    this.rng = rng;

    this.arena = new Arena(this);
    this.auction = new Auction(this);
    this.tower = new Tower(this);
    this.hunt = new Hunt(this);
    this.casino = new Casino(this);
    this.wish = new Wish(this);
  }

  get heroClass() {
    return this.data.classes.find((c) => c.id === this.hero.classId);
  }

  get classEmoji() {
    return this.heroClass?.emoji ?? '🧑';
  }

  /** 大厅内获得神器（祈愿/拍卖行渠道） */
  grantHeroRelic(relic) {
    if (!this.hero.relics) this.hero.relics = [];
    if (!this.hero.relics.includes(relic.id)) {
      this.hero.relics.push(relic.id);
      this.hero.save();
    }
  }

  /** 尚未拥有的神器池 */
  unownedRelics() {
    return this.data.relics.filter((r) => !(this.hero.relics ?? []).includes(r.id));
  }

  toast(msg) {
    const layer = document.getElementById('toast-layer');
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    layer.appendChild(el);
    while (layer.children.length > 4) layer.firstChild.remove();
    setTimeout(() => el.remove(), 2700);
  }

  /** 显示大厅；玩家进入需要地图的玩法（冒险/经典挑战）时 resolve(mode) */
  show() {
    return new Promise((resolve) => {
      this._resolve = resolve;
      this._render();
    });
  }

  _launch(mode) {
    this.layer?.remove();
    this.layer = null;
    this._resolve?.(mode);
  }

  _render() {
    this.layer?.remove();
    const hero = this.hero;
    const layer = document.createElement('div');
    layer.id = 'hub-screen';
    const weapon = hero.weapon ? `${hero.weapon.emoji} ${hero.weapon.displayName ?? hero.weapon.name}` : t('hud.empty');
    const armor = hero.armor ? `${hero.armor.emoji} ${hero.armor.displayName ?? hero.armor.name}` : t('hud.empty');

    layer.innerHTML = `
      <div class="hub-inner">
        <div class="hub-hero-card">
          <span class="hub-hero-emoji">${this.classEmoji}</span>
          <div class="hub-hero-stats">
            <b>${this.heroClass?.name ?? ''}　⭐ Lv.${hero.level ?? 1}</b>
            <span>💪 ${hero.effectivePower}　❤️ ${hero.maxHp}　💰 ${hero.gold}</span>
            <span class="hub-hero-gear">🗡️ ${weapon}　🛡️ ${armor}　🎒 ${hero.inventory.length}/${hero.inventorySize}</span>
          </div>
        </div>
        <div class="hub-grid"></div>
        <div class="hub-footer">
          <button class="action-btn" id="hub-bag">🎒 ${t('inv.title').replace('🎒 ', '')}</button>
          <button class="action-btn" id="hub-achv">🏅 ${t('achv.title')}</button>
          <button class="action-btn" id="hub-codex">📖 ${t('codex.title')}</button>
          <button class="action-btn" id="hub-howto">${t('titleScreen.howto')}</button>
          <button class="action-btn" id="hub-settings">${t('titleScreen.settings')}</button>
        </div>
      </div>`;
    document.body.appendChild(layer);
    this.layer = layer;

    const entries = [
      { emoji: '🗺️', key: 'hubAdventure', sub: t('hub.adventureSub', { cur: hero.currentFloor ?? 1, n: hero.stats.deepestFloor }), fn: () => this._launch('adventure') },
      { emoji: '⚔️', key: 'hubArena', sub: t('hub.arenaSub', { w: hero.arenaWins, l: hero.arenaLosses }), fn: () => this._enter(this.arena) },
      { emoji: '🏛️', key: 'hubAuction', sub: t('hub.auctionSub'), fn: () => this._enter(this.auction) },
      { emoji: '🗼', key: 'hubTower', sub: t('hub.towerSub', { n: hero.towerBest }), fn: () => this._enter(this.tower) },
      { emoji: '🐉', key: 'hubHunt', sub: t('hub.huntSub', { n: Object.values(hero.huntKills).reduce((s, x) => s + x, 0) }), fn: () => this._enter(this.hunt) },
      { emoji: '🎰', key: 'hubCasino', sub: t('hub.casinoSub'), fn: () => this._enter(this.casino) },
      { emoji: '⛩️', key: 'hubWish', sub: t('hub.wishSub', { n: hero.wishCount }), fn: () => this._enter(this.wish) },
      { emoji: '🏆', key: 'hubClassic', sub: t('hub.classicSub'), fn: () => this._classicMenu() },
    ];
    const grid = layer.querySelector('.hub-grid');
    for (const e of entries) {
      const card = document.createElement('div');
      card.className = 'hub-card';
      card.innerHTML = `<span class="hub-card-emoji">${e.emoji}</span><b>${t(`hub.${e.key}`)}</b><small>${e.sub}</small>`;
      card.addEventListener('click', e.fn);
      grid.appendChild(card);
    }

    layer.querySelector('.hub-hero-card').addEventListener('click', () => this._heroDetail());
    layer.querySelector('#hub-bag').addEventListener('click', () => this._bag());
    layer.querySelector('#hub-achv').addEventListener('click', () => this._achievements());
    layer.querySelector('#hub-codex').addEventListener('click', () => this._codex());

    // 大厅刷新时结算可能新达成的成就（竞技场/试炼塔/祈愿等）
    checkAchievements(this.hero, this.data.achievements, (a) => {
      this.toast(t('achv.unlocked', { name: `${a.emoji} ${a.name}`, n: a.reward }));
    });
    layer.querySelector('#hub-howto').addEventListener('click', async () => {
      await this.modal.show({
        title: t('howto.title'),
        bodyHTML: `<div class="howto-body">${t('howto.body')}</div>`,
        choices: [{ label: t('howto.close'), value: 0 }],
      });
    });
    layer.querySelector('#hub-settings').addEventListener('click', () => this._settings());
  }

  async _enter(mode) {
    await mode.open();
    this._render();   // 玩法结束后刷新角色卡
  }

  async _classicMenu() {
    const today = new Date().toISOString().slice(0, 10);
    const week = Math.floor(Date.now() / (7 * 86400e3));
    const weeklyRule = this.data.weekly[week % this.data.weekly.length];
    const weeklyBest = this.saveMeta.meta.weeklyBest?.[`W${week}`] ?? '—';
    const picked = await this.modal.show({
      title: t('hub.hubClassic'),
      bodyHTML: `<p>${t('hub.classicIntro', { n: this.config.classicReward.goldPerFloor })}</p>`,
      choices: [
        { label: t('modes.endless'), sub: t('modes.endlessDesc', { n: this.saveMeta.meta.endlessBest || '—' }), value: 'endless' },
        { label: t('modes.daily'), sub: t('modes.dailyDesc', { date: today, n: this.saveMeta.meta.dailyBest?.[today] ?? '—' }), value: 'daily' },
        { label: `${weeklyRule.emoji} ${t('modes.weekly')}`, sub: t('modes.weeklyDesc', { name: weeklyRule.name, desc: weeklyRule.desc, best: weeklyBest }), value: 'weekly' },
        { label: t('modes.versus'), sub: t('modes.versusDesc', { n: this.config.versus.targetFloor, w: this.saveMeta.meta.pvpWins, l: this.saveMeta.meta.pvpLosses }), value: 'versus' },
        { label: t('hub.back'), value: null },
      ],
    });
    if (picked) this._launch(picked);
  }

  /** 📖 图鉴：怪物 / 装备 / 神器收集进度 */
  async _codex() {
    const codex = this.hero.codex ?? { monsters: {}, gear: [] };
    const m = this.data.monsters;
    const allMonsters = [...m.monster, ...m.elite, ...m.boss];
    const allGear = [...this.data.weapons, ...this.data.armors];
    const relics = this.data.relics;
    const ownedRelics = this.hero.relics ?? [];

    const cell = (known, emoji, name, sub) => `
      <div class="shop-item" style="${known ? '' : 'opacity:0.35;filter:grayscale(1)'};cursor:default">
        <div class="shop-emoji">${known ? emoji : '❓'}</div>
        <div class="shop-name">${known ? name : '？？？'}</div>
        ${sub ? `<div class="shop-desc">${sub}</div>` : ''}
      </div>`;

    const monsterHtml = allMonsters.map((x) => {
      const kills = codex.monsters?.[x.id] ?? 0;
      return cell(kills > 0, x.emoji, x.name, kills > 0 ? t('codex.kills', { n: kills }) : '');
    }).join('');
    const gearHtml = allGear.map((x) => cell(codex.gear?.includes(x.id), x.emoji, x.name, '')).join('');
    const relicHtml = relics.map((x) => cell(ownedRelics.includes(x.id), x.emoji, x.name, ownedRelics.includes(x.id) ? x.desc : '')).join('');

    const mDone = allMonsters.filter((x) => (codex.monsters?.[x.id] ?? 0) > 0).length;
    const gDone = allGear.filter((x) => codex.gear?.includes(x.id)).length;

    await this.modal.show({
      title: `📖 ${t('codex.title')}`,
      bodyHTML: `
        <p><b>${t('codex.monsters')}（${mDone}/${allMonsters.length}）</b></p><div class="shop-grid">${monsterHtml}</div>
        <p><b>${t('codex.gear')}（${gDone}/${allGear.length}）</b></p><div class="shop-grid">${gearHtml}</div>
        <p><b>${t('codex.relics')}（${ownedRelics.length}/${relics.length}）</b></p><div class="shop-grid">${relicHtml}</div>`,
      choices: [{ label: t('howto.close'), value: 0 }],
    });
  }

  /** 角色详情：战力构成、身上装备完整属性、可卸下 */
  async _heroDetail() {
    const hero = this.hero;
    while (true) {
      const weaponPower = hero.weapon?.power ?? 0;
      const cursePenalty = hero.curses * 2;
      const expToNext = this.config.exp.baseToNext + ((hero.level ?? 1) - 1) * this.config.exp.perLevel;
      const statsHtml = `
        <p>⭐ ${t('hub.detailLevel', { lv: hero.level ?? 1, exp: hero.exp ?? 0, next: expToNext })}</p>
        <p>💪 ${t('hub.detailPower', { total: hero.effectivePower, base: hero.power, weapon: weaponPower, curse: cursePenalty })}</p>
        <p>❤️ ${hero.maxHp}　🎒 ${hero.inventory.length}/${hero.inventorySize}${hero.curses ? `　💀×${hero.curses}` : ''}</p>
        <p style="color:var(--text-dim)">${t('hub.detailRecord', { adv: hero.stats.adventures, deep: hero.stats.deepestFloor, kills: hero.stats.kills, wins: hero.stats.throneWins })}</p>
        ${(hero.relics ?? []).length ? `<p>${t('hub.detailRelics')}<br>${(hero.relics ?? []).map((id) => {
          const r = this.data.relics.find((x) => x.id === id);
          return r ? `<span title="${r.desc}" style="cursor:help">${r.emoji} ${r.name}</span>` : '';
        }).join('　')}</p>` : ''}`;

      const choices = [];
      if (hero.weapon) {
        choices.push({
          label: `🗡️ ${hero.weapon.emoji} ${hero.weapon.displayName ?? hero.weapon.name}`,
          sub: `${gearStat('weapon', hero.weapon, t)}　${hero.bagFree ? t('hub.detailUnequip') : t('gear.bagFull')}`,
          disabled: !hero.bagFree,
          value: 'weapon',
        });
      }
      if (hero.armor) {
        choices.push({
          label: `🛡️ ${hero.armor.emoji} ${hero.armor.displayName ?? hero.armor.name}`,
          sub: `${gearStat('armor', hero.armor, t)}　${hero.bagFree ? t('hub.detailUnequip') : t('gear.bagFull')}`,
          disabled: !hero.bagFree,
          value: 'armor',
        });
      }
      if (!choices.length) {
        choices.push({ label: t('hub.detailNoGear'), disabled: true, value: 'none' });
      }
      choices.push({ label: t('inv.close'), value: 'close' });

      const picked = await this.modal.show({
        title: `${this.classEmoji} ${this.heroClass?.name ?? ''}`,
        bodyHTML: statsHtml,
        choices,
      });
      if (picked === 'weapon' && hero.weapon) {
        hero.inventory.push({ kind: 'weapon', item: hero.weapon });
        hero.weapon = null;
        hero.save();
        this.toast(t('hub.detailUnequipped'));
      } else if (picked === 'armor' && hero.armor) {
        hero.inventory.push({ kind: 'armor', item: hero.armor });
        hero.armor = null;
        hero.save();
        this.toast(t('hub.detailUnequipped'));
      } else {
        break;
      }
    }
    this._render();
  }

  /** 大厅背包：查看 / 装备互换 / 卖出 */
  async _bag() {
    const hero = this.hero;
    while (true) {
      const items = hero.inventory.map((e, i) => ({
        label: `${e.item.emoji} ${e.item.displayName ?? e.item.name}`,
        sub: (e.kind === 'weapon' || e.kind === 'armor') ? gearStat(e.kind, e.item, t) : '',
        value: i,
      }));
      const picked = await this.modal.show({
        title: t('inv.title'),
        bodyHTML: `<p>${items.length ? t('inv.hint') : t('inv.emptyHint')}</p>`,
        choices: [...items, { label: t('inv.close'), value: -1 }],
      });
      if (picked < 0 || picked === undefined) break;
      const entry = hero.inventory[picked];
      if (entry.kind === 'weapon' || entry.kind === 'armor') {
        const sell = hero.sellPrice(entry.item);
        const act = await this.modal.show({
          title: `${entry.item.emoji} ${entry.item.displayName ?? entry.item.name}`,
          bodyHTML: `<p>${gearStat(entry.kind, entry.item, t)}</p>`,
          choices: [
            { label: t('inv.equip'), value: 'equip' },
            { label: t('inv.sell', { n: sell }), value: 'sell' },
            { label: t('inv.close'), value: 'cancel' },
          ],
        });
        if (act === 'equip') {
          hero.inventory.splice(picked, 1);
          const old = entry.kind === 'weapon' ? hero.weapon : hero.armor;
          if (entry.kind === 'weapon') hero.weapon = entry.item;
          else hero.armor = entry.item;
          if (old) hero.inventory.push({ kind: entry.kind, item: old });
          hero.save();
          this.toast(t('toast.swapped', { name: entry.item.displayName ?? entry.item.name }));
        } else if (act === 'sell') {
          hero.inventory.splice(picked, 1);
          hero.changeGold(sell);
          this.toast(t('toast.gearSold', { name: entry.item.displayName ?? entry.item.name, n: sell }));
        }
      } else if (entry.kind === 'key') {
        this.toast(t('toast.keepKey'));
      } else {
        this.toast(t('hub.bagUseInAdventure'));
      }
    }
    this._render();
  }

  /** 成就列表：已达成金色，未达成灰显 */
  async _achievements() {
    const owned = this.hero.achievements ?? [];
    const rows = this.data.achievements.map((a) => {
      const done = owned.includes(a.id);
      return `<p style="${done ? '' : 'opacity:0.45;filter:grayscale(1)'}">
        ${a.emoji} <b style="color:${done ? 'var(--gold)' : 'inherit'}">${a.name}</b>　${a.desc}　<span style="color:var(--gold)">+${a.reward}💰</span>${done ? ' ✅' : ''}
      </p>`;
    }).join('');
    await this.modal.show({
      title: `🏅 ${t('achv.title')}（${owned.length}/${this.data.achievements.length}）`,
      bodyHTML: `<div class="howto-body">${rows}</div>`,
      choices: [{ label: t('howto.close'), value: 0 }],
    });
  }

  /** 存档导出/导入：base64 码可复制迁移到其他设备 */
  async _backup() {
    const encode = () => {
      const payload = {
        v: 1,
        hero: JSON.parse(localStorage.getItem('deckbound_hero_v1') ?? 'null'),
        meta: JSON.parse(localStorage.getItem('deckbound_meta_v1') ?? 'null'),
      };
      return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    };

    await new Promise((resolve) => {
      const box = this.modal.showRaw();
      box.innerHTML = `
        <h2>${t('backup.title')}</h2>
        <p>${t('backup.exportHint')}</p>
        <textarea id="backup-text" style="width:100%;height:110px;background:#ffffff0a;color:var(--text-main);border:1px solid var(--border-dim);border-radius:8px;padding:8px;font-size:11px;word-break:break-all">${encode()}</textarea>
        <div class="modal-choices">
          <button class="modal-choice" id="backup-copy">${t('backup.copy')}</button>
          <button class="modal-choice" id="backup-import">${t('backup.import')}<small>${t('backup.importHint')}</small></button>
          <button class="modal-choice" id="backup-close">${t('inv.close')}</button>
        </div>`;
      const textarea = box.querySelector('#backup-text');
      box.querySelector('#backup-copy').addEventListener('click', async () => {
        textarea.select();
        try { await navigator.clipboard.writeText(textarea.value); } catch { document.execCommand('copy'); }
        this.toast(t('backup.copied'));
      });
      box.querySelector('#backup-import').addEventListener('click', () => {
        try {
          const payload = JSON.parse(decodeURIComponent(escape(atob(textarea.value.trim()))));
          if (!payload.hero?.classId) throw new Error('bad save');
          localStorage.setItem('deckbound_hero_v1', JSON.stringify(payload.hero));
          if (payload.meta) localStorage.setItem('deckbound_meta_v1', JSON.stringify(payload.meta));
          this.modal.hide();
          try { sessionStorage.setItem('deckbound_skip_title', '1'); } catch { /* 忽略 */ }
          location.reload();
        } catch {
          this.toast(t('backup.invalid'));
        }
      });
      box.querySelector('#backup-close').addEventListener('click', () => { this.modal.hide(); resolve(); });
    });
  }

  async _settings() {
    const picked = await this.modal.show({
      title: t('settings.title'),
      choices: [
        { label: t('settings.sound', { state: sound.enabled ? t('settings.soundOn') : t('settings.soundOff') }), value: 'sound' },
        { label: t('settings.music', { state: sound.musicOn ? t('settings.soundOn') : t('settings.soundOff') }), value: 'music' },
        { label: t('settings.fastCombat', { state: CombatView.fastMode ? t('settings.soundOn') : t('settings.soundOff') }), sub: t('settings.fastCombatSub'), value: 'fast' },
        { label: t('settings.language'), sub: t('settings.languageSub'), value: 'lang' },
        { label: t('backup.title'), sub: t('backup.sub'), value: 'backup' },
        { label: t('hub.resetHero'), sub: t('hub.resetHeroSub'), value: 'reset' },
        { label: t('hub.back'), value: 'back' },
      ],
    });
    if (picked === 'fast') {
      CombatView.toggleFast();
      this.toast(t('settings.fastCombat', { state: CombatView.fastMode ? t('settings.soundOn') : t('settings.soundOff') }));
    } else if (picked === 'backup') {
      await this._backup();
    } else if (picked === 'sound') {
      sound.toggle();
      this.toast(t('settings.sound', { state: sound.enabled ? t('settings.soundOn') : t('settings.soundOff') }));
    } else if (picked === 'music') {
      sound.toggleMusic();
      this.toast(t('settings.music', { state: sound.musicOn ? t('settings.soundOn') : t('settings.soundOff') }));
    } else if (picked === 'lang') {
      await i18n.setLang(i18n.otherLang);
      location.reload();
    } else if (picked === 'reset') {
      const confirm = await this.modal.show({
        title: t('hub.resetHero'),
        bodyHTML: `<p>${t('hub.resetConfirm')}</p>`,
        choices: [
          { label: t('hub.back'), value: 'no' },
          { label: t('hub.resetYes'), value: 'yes' },
        ],
      });
      if (confirm === 'yes') {
        Hero.reset();
        location.reload();
      }
    }
  }
}
