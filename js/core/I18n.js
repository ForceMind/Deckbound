/**
 * 多语言 —— 默认中文，设置中可切换（localStorage 记忆）。
 * UI 系统文本走语言包；游戏内容数据（怪物名/事件文本等）暂为中文，
 * 后续内容本地化只需为 data/*.json 提供对应语言版本。
 */
const LANG_KEY = 'deckbound_lang';

export class I18n {
  constructor() {
    this.lang = localStorage.getItem(LANG_KEY) ?? 'zh';
    this.dict = {};
  }

  async load() {
    const res = await fetch(`data/i18n/${this.lang}.json`);
    if (!res.ok) throw new Error(`i18n load failed: ${this.lang}`);
    this.dict = await res.json();
  }

  /** t('shop.refresh', { n: 10 }) → 按点路径查找并替换 {n} 占位符 */
  t(key, params = {}) {
    let node = this.dict;
    for (const part of key.split('.')) {
      node = node?.[part];
      if (node === undefined) return key;
    }
    return String(node).replace(/\{(\w+)\}/g, (_, k) => params[k] ?? `{${k}}`);
  }

  async setLang(lang) {
    this.lang = lang;
    localStorage.setItem(LANG_KEY, lang);
    await this.load();
  }

  get otherLang() {
    return this.lang === 'zh' ? 'en' : 'zh';
  }

  /** 渲染 index.html 中带 data-i18n / data-i18n-title 的静态元素 */
  applyStatic() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.innerHTML = this.t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.title = this.t(el.dataset.i18nTitle);
    });
  }
}

/** 全局单例与快捷函数 */
export const i18n = new I18n();
export const t = (key, params) => i18n.t(key, params);
