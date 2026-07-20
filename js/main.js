import { DataLoader } from './core/DataLoader.js';
import { SaveMeta } from './core/SaveMeta.js';
import { Game } from './core/Game.js';
import { i18n, t } from './core/I18n.js';
import { ModalView } from './ui/ModalView.js';
import { TitleView } from './ui/TitleView.js';

/**
 * 入口 —— 加载语言与配置 → 标题画面 → 启动游戏。
 */
async function boot() {
  try {
    await i18n.load();
    i18n.applyStatic();
    document.title = `${t('app.title')} · Deckbound`;

    const loader = new DataLoader();
    const data = await loader.loadAll();
    const saveMeta = new SaveMeta();
    const titleView = new TitleView(new ModalView(), saveMeta);

    await titleView.show();

    const game = new Game(data, saveMeta, titleView);
    window.__game = game;   // 调试入口
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
