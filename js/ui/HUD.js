import { bus } from '../core/EventBus.js';
import { t } from '../core/I18n.js';

/**
 * HUD —— 顶栏属性 + 右侧装备/道具/状态栏。
 * 纯被动渲染：监听事件总线，不持有游戏逻辑。
 */
export class HUD {
  constructor(animator) {
    this.animator = animator;
    this.onUseItem = null;   // 由 Game 注入

    bus.on('statsChanged', (p) => this.renderStats(p));
    bus.on('equipChanged', (p) => this.renderEquip(p));
    bus.on('inventoryChanged', (p) => { this.renderInventory(p); this.renderBuffs(p); });
    bus.on('goldGained', () => this.animator.bumpStat('hud-gold'));
    bus.on('powerGained', () => this.animator.bumpStat('hud-power'));
    bus.on('levelUp', () => this.animator.bumpStat('hud-level'));
    bus.on('playerHurt', () => this.animator.bumpStat('hud-hp'));
  }

  renderAll(player, floor) {
    this.renderStats(player);
    this.renderFloor(floor);
    this.renderEquip(player);
    this.renderInventory(player);
    this.renderBuffs(player);
  }

  renderStats(p) {
    const lvEl = document.getElementById('hud-level');
    if (lvEl) {
      lvEl.innerHTML = `⭐ <b>${p.level}</b>`;
      lvEl.title = `${t('hud.level')} ${p.level}　${p.exp}/${p.expToNext} EXP`;
    }
    this._set('hud-hp', `❤️ <b>${p.hp}</b>/<i>${p.maxHp}</i>`);
    this._set('hud-power', `💪 <b>${p.effectivePower}</b>`);
    this._set('hud-energy', `⚡ <b>${p.energy}</b>/<i>${p.maxEnergy}</i>`);
    this._set('hud-gold', `💰 <b>${p.gold}</b>`);
  }

  renderFloor(floor) {
    this._set('hud-floor', t('hud.floorLabel', { n: floor }));
  }

  renderEquip(p) {
    const wEl = document.getElementById('equip-weapon');
    const aEl = document.getElementById('equip-armor');
    if (p.weapon) {
      wEl.classList.add('filled');
      const stat = t('hud.weaponStat', { power: p.weapon.power ?? 0, crit: Math.round((p.weapon.crit ?? 0) * 100) });
      wEl.innerHTML = `<span class="slot-icon">${p.weapon.emoji}</span><span class="slot-name">${p.weapon.displayName ?? p.weapon.name}<br><small>${stat}</small></span>`;
    } else {
      wEl.classList.remove('filled');
      wEl.innerHTML = `<span class="slot-icon">🗡️</span><span class="slot-name">${t('hud.empty')}</span>`;
    }
    if (p.armor) {
      aEl.classList.add('filled');
      aEl.innerHTML = `<span class="slot-icon">${p.armor.emoji}</span><span class="slot-name">${p.armor.displayName ?? p.armor.name}<br><small>${t('hud.armorStat', { block: p.armor.block ?? 0 })}</small></span>`;
    } else {
      aEl.classList.remove('filled');
      aEl.innerHTML = `<span class="slot-icon">🛡️</span><span class="slot-name">${t('hud.empty')}</span>`;
    }
  }

  renderInventory(p) {
    const grid = document.getElementById('sidebar-inventory');
    grid.innerHTML = '';
    for (let i = 0; i < p.inventorySize; i++) {
      const cell = document.createElement('div');
      const entry = p.inventory[i];
      if (entry) {
        cell.className = 'inv-cell';
        cell.textContent = entry.item.emoji ?? '❔';
        cell.title = entry.item.name ?? '';
        cell.addEventListener('click', () => this.onUseItem?.(i));
      } else {
        cell.className = 'inv-cell empty';
      }
      grid.appendChild(cell);
    }
  }

  renderBuffs(p) {
    const list = document.getElementById('sidebar-buffs');
    list.innerHTML = '';
    // 神器（悬浮显示效果说明）
    if (p.relics?.length && this.relicsData) {
      for (const id of p.relics) {
        const r = this.relicsData.find((x) => x.id === id);
        if (!r) continue;
        const el = document.createElement('div');
        el.className = 'buff-item relic';
        el.textContent = `${r.emoji} ${r.name}`;
        el.title = r.desc;
        list.appendChild(el);
      }
    }
    if (p.curses > 0) {
      const el = document.createElement('div');
      el.className = 'buff-item curse';
      el.textContent = t('hud.curse', { n: p.curses, loss: p.curses * 2 });
      list.appendChild(el);
    }
    for (const b of p.buffs.slice(-6)) {
      const el = document.createElement('div');
      el.className = `buff-item${b.isCurse ? ' curse' : ''}`;
      el.textContent = b.text;
      list.appendChild(el);
    }
    if (!list.children.length) {
      list.innerHTML = `<div class="buff-item">${t('hud.noStatus')}</div>`;
    }
  }

  _set(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }
}
