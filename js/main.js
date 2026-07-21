import { DataLoader } from './core/DataLoader.js';
import { SaveMeta } from './core/SaveMeta.js';
import { Game } from './core/Game.js';
import { Hero } from './core/Hero.js';
import { RNG } from './core/RNG.js';
import { i18n, t } from './core/I18n.js';
import { sound } from './core/Sound.js';
import { ModalView } from './ui/ModalView.js';
import { TitleView } from './ui/TitleView.js';
import { Hub, pickClass } from './hub/Hub.js';

/**
 * 入口 —— 标题 → 持久角色（首次：序章+选职业）→ 大厅 → 各玩法。
 * 冒险/经典挑战结束后 reload 回到此流程（角色与进度都在 localStorage）。
 */
async function boot() {
  try {
    await i18n.load();
    i18n.applyStatic();
    document.title = `${t('app.title')} · Deckbound`;

    const loader = new DataLoader();
    const data = await loader.loadAll();
    const saveMeta = new SaveMeta();
    const modal = new ModalView();
    const titleView = new TitleView(modal, saveMeta, data.config);

    // 从冒险/挑战返回时跳过标题画面，直接回大厅
    let skipTitle = false;
    try {
      skipTitle = sessionStorage.getItem('deckbound_skip_title') === '1';
      sessionStorage.removeItem('deckbound_skip_title');
    } catch { /* 忽略 */ }
    sound.startMusic('hub');   // 标题与大厅共用平静主题
    if (!skipTitle) await titleView.show();
    else titleView.layer?.remove();

    // 持久角色：首次进入创建（序章 + 选职业），之后一直存在
    let hero = Hero.load(data.config);
    if (!hero) {
      await titleView.playPrologue();
      const cls = await pickClass(modal, data.classes, saveMeta, new RNG());
      hero = Hero.create(data.config, cls);
      if (cls.bonus?.startWeapon) {
        const proto = data.weapons.find((w) => w.id === cls.bonus.startWeapon);
        if (proto) { hero.weapon = { ...proto }; hero.save(); }
      }
    }

    // 大厅：resolve 时进入需要牌阵的玩法（冒险 / 经典挑战）
    const hub = new Hub(data, hero, saveMeta, modal, new RNG());
    const mode = await hub.show();

    let seed;
    if (mode === 'daily') {
      seed = Number(new Date().toISOString().slice(0, 10).replace(/-/g, '')) >>> 0;
    } else if (mode === 'weekly') {
      // 每周同一种子：全球同图同规则
      seed = (Math.floor(Date.now() / (7 * 86400e3)) * 7919) >>> 0;
    }
    const game = new Game(data, saveMeta, titleView, seed, mode, hero);
    window.__game = game;   // 调试入口
    window.__hero = hero;
    await game.start();
  } catch (err) {
    console.error(err);
    const title = i18n.dict?.app ? t('app.loadFailTitle') : '启动失败';
    const hint = i18n.dict?.app ? t('app.loadFailHint') : '请通过本地服务器访问（如 npx http-server）。';
    document.body.innerHTML = `
      <div style="color:#e8e6df;font-family:sans-serif;text-align:center;padding-top:20vh">
        <h2>${title}</h2>
        <p>${err.message}</p>
        <p style="color:#8a92ac">${hint}</p>
      </div>`;
  }
}

boot();
