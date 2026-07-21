import { Animator } from '../anim/Animator.js';
import { HUD } from './HUD.js';
import { BoardView } from './BoardView.js';
import { ModalView } from './ModalView.js';
import { CombatView } from './CombatView.js';
import { ShopView } from './ShopView.js';
import { EventView } from './EventView.js';
import { StageView } from './StageView.js';

/**
 * UI 总管 —— 组装所有视图，提供 toast 与底栏交互绑定。
 */
export class UIManager {
  constructor(config, relicsData = null) {
    this.animator = new Animator();
    this.hud = new HUD(this.animator);
    this.hud.relicsData = relicsData;
    this.boardView = new BoardView(config);
    this.modal = new ModalView();
    this.combatView = new CombatView(this.modal, this.animator, config);
    this.shopView = new ShopView(this.modal);
    this.eventView = new EventView(this.modal);
    this.stageView = new StageView();
  }

  bindActions({ onRest, onInventory, onMap, onSettings }) {
    document.getElementById('btn-rest').addEventListener('click', onRest);
    document.getElementById('btn-inventory').addEventListener('click', onInventory);
    document.getElementById('btn-map').addEventListener('click', onMap);
    document.getElementById('btn-settings').addEventListener('click', onSettings);
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
}
