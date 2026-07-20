/**
 * 动画工具 —— 所有动画效果的统一出口（promise 化，便于游戏流程 await）。
 */
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class Animator {
  constructor() {
    this.fxLayer = document.getElementById('fx-layer');
  }

  /** 在某元素上方漂浮数字（伤害/治疗/战力/金币）。挂在 body 上，模态内也可见 */
  floatNum(targetEl, text, cls = 'dmg') {
    if (!targetEl) return;
    const rect = targetEl.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = `float-num ${cls}`;
    el.textContent = text;
    el.style.left = `${rect.left + rect.width / 2 - 14}px`;
    el.style.top = `${rect.top}px`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }

  /** 金币从某位置飞向顶部金币栏 */
  flyCoins(fromEl, count = 5) {
    const goldEl = document.getElementById('hud-gold');
    if (!fromEl || !goldEl) return;
    const from = fromEl.getBoundingClientRect();
    const to = goldEl.getBoundingClientRect();
    for (let i = 0; i < count; i++) {
      const coin = document.createElement('div');
      coin.className = 'fly-coin';
      coin.textContent = '🪙';
      coin.style.left = `${from.left + from.width / 2 + (Math.random() - 0.5) * 40}px`;
      coin.style.top = `${from.top + from.height / 2 + (Math.random() - 0.5) * 30}px`;
      document.body.appendChild(coin);
      setTimeout(() => {
        coin.style.transform = `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(0.4)`;
        coin.style.opacity = '0';
      }, 40 + i * 70);
      setTimeout(() => coin.remove(), 900 + i * 70);
    }
  }

  /** HUD 数值弹跳 */
  bumpStat(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('bump');
    void el.offsetWidth;   // 重新触发动画
    el.classList.add('bump');
    setTimeout(() => el.classList.remove('bump'), 200);
  }

  /** 屏幕震动（Boss 出场 / 重伤） */
  screenShake() {
    const app = document.getElementById('app');
    app.classList.remove('screen-shake');
    void app.offsetWidth;
    app.classList.add('screen-shake');
    setTimeout(() => app.classList.remove('screen-shake'), 450);
  }
}
