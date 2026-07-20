import { t, i18n } from '../core/I18n.js';

/**
 * 标题画面 —— 游戏入口：开始冒险 / 游戏说明 / 冒险手记 / 设置。
 * 开始后播放序章（首次），随后进入职业选择。
 */
export class TitleView {
  constructor(modal, saveMeta) {
    this.modal = modal;
    this.saveMeta = saveMeta;
    this.layer = null;
  }

  /** 显示标题画面，玩家点击「开始冒险」后 resolve */
  show() {
    return new Promise((resolve) => {
      const layer = document.createElement('div');
      layer.id = 'title-screen';
      const best = this.saveMeta.meta.bestFloor;
      layer.innerHTML = `
        <div class="title-inner">
          <div class="title-cards">🂡 🂱 🃁 🃑</div>
          <h1 class="title-logo">${t('app.title')}</h1>
          <p class="title-tagline">${t('app.tagline')}</p>
          <div class="title-menu">
            <button class="title-btn primary" id="title-start">${t('titleScreen.start')}</button>
            <button class="title-btn" id="title-howto">${t('titleScreen.howto')}</button>
            <button class="title-btn" id="title-records">${t('titleScreen.records')}</button>
            <button class="title-btn" id="title-settings">${t('titleScreen.settings')}</button>
          </div>
          <p class="title-meta">${best > 0 ? t('titleScreen.bestFloor', { n: best }) : t('titleScreen.noRecord')}</p>
        </div>`;
      document.body.appendChild(layer);
      this.layer = layer;

      layer.querySelector('#title-start').addEventListener('click', async () => {
        await this._playPrologue();
        layer.classList.add('title-fade');
        setTimeout(() => { layer.remove(); this.layer = null; }, 500);
        resolve();
      });
      layer.querySelector('#title-howto').addEventListener('click', () => this.showHowto());
      layer.querySelector('#title-records').addEventListener('click', () => this._showRecords());
      layer.querySelector('#title-settings').addEventListener('click', () => this._showSettings());
    });
  }

  async _playPrologue() {
    await this.modal.show({
      title: t('prologue.title'),
      bodyHTML: `<p class="story-text">${t('prologue.text')}</p>`,
      choices: [{ label: t('prologue.continue'), value: 0 }],
    });
  }

  /** 游戏说明（标题画面与游戏内设置共用） */
  async showHowto() {
    await this.modal.show({
      title: t('howto.title'),
      bodyHTML: `<div class="howto-body">${t('howto.body')}</div>`,
      choices: [{ label: t('howto.close'), value: 0 }],
    });
  }

  async _showRecords() {
    const m = this.saveMeta.meta;
    await this.modal.show({
      title: t('map.title'),
      bodyHTML: `<p>${t('map.history', { best: m.bestFloor, runs: m.totalRuns, bossTotal: m.bossKills, wins: m.wins ?? 0 })}</p>`,
      choices: [{ label: t('howto.close'), value: 0 }],
    });
  }

  async _showSettings() {
    const picked = await this.modal.show({
      title: t('settings.title'),
      choices: [
        { label: t('settings.language'), sub: t('settings.languageSub'), value: 'lang' },
        { label: t('howto.close'), value: 'back' },
      ],
    });
    if (picked === 'lang') {
      await i18n.setLang(i18n.otherLang);
      i18n.applyStatic();
      location.reload();
    }
  }
}
