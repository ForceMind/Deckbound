import { t } from '../core/I18n.js';

/**
 * 新手引导 —— 分步高亮讲解界面元素与规则。
 * 首次开局自动播放（localStorage 记忆），设置里可重看。
 */
const TUTORIAL_KEY = 'deckbound_tutorial_done';

export const STEPS = [
  { selector: '#player-card', key: 'tutorial.steps.player' },
  { selector: '.row-near', key: 'tutorial.steps.near' },
  { selector: '.row-far', key: 'tutorial.steps.far' },
  { selector: '#hud-energy', key: 'tutorial.steps.energy' },
  { selector: '#hud-power', key: 'tutorial.steps.power' },
  { selector: '#btn-rest', key: 'tutorial.steps.rest' },
  { selector: '#quest-bar', key: 'tutorial.steps.quest' },
];

export class TutorialView {
  static isDone() {
    return localStorage.getItem(TUTORIAL_KEY) === '1';
  }

  static markDone() {
    localStorage.setItem(TUTORIAL_KEY, '1');
  }

  /** 依次高亮每个步骤，全部完成或跳过后 resolve */
  async run() {
    const layer = document.createElement('div');
    layer.id = 'tutorial-layer';
    layer.innerHTML = `
      <div class="tut-highlight"></div>
      <div class="tut-box">
        <p class="tut-text"></p>
        <div class="tut-actions">
          <button class="tut-skip">${t('tutorial.skip')}</button>
          <button class="tut-next">${t('tutorial.next')}</button>
        </div>
      </div>`;
    document.body.appendChild(layer);

    const highlight = layer.querySelector('.tut-highlight');
    const box = layer.querySelector('.tut-box');
    const text = layer.querySelector('.tut-text');
    const nextBtn = layer.querySelector('.tut-next');
    const skipBtn = layer.querySelector('.tut-skip');

    for (let i = 0; i < STEPS.length; i++) {
      const step = STEPS[i];
      const target = document.querySelector(step.selector);
      if (!target) continue;

      const r = target.getBoundingClientRect();
      const pad = 8;
      highlight.style.left = `${r.left - pad}px`;
      highlight.style.top = `${r.top - pad}px`;
      highlight.style.width = `${r.width + pad * 2}px`;
      highlight.style.height = `${r.height + pad * 2}px`;

      text.textContent = t(step.key);
      nextBtn.textContent = i === STEPS.length - 1 ? t('tutorial.done') : t('tutorial.next');

      // 提示框放在高亮区下方，放不下则放上方
      box.style.visibility = 'hidden';
      await new Promise(requestAnimationFrame);
      const bh = box.offsetHeight;
      const below = r.bottom + pad + 14;
      box.style.top = below + bh + 20 < window.innerHeight ? `${below}px` : `${r.top - pad - bh - 14}px`;
      box.style.left = `${Math.max(14, Math.min(r.left + r.width / 2 - 170, window.innerWidth - 360))}px`;
      box.style.visibility = 'visible';

      const skipped = await new Promise((res) => {
        const onNext = () => { cleanup(); res(false); };
        const onSkip = () => { cleanup(); res(true); };
        const cleanup = () => {
          nextBtn.removeEventListener('click', onNext);
          skipBtn.removeEventListener('click', onSkip);
        };
        nextBtn.addEventListener('click', onNext);
        skipBtn.addEventListener('click', onSkip);
      });
      if (skipped) break;
    }

    layer.remove();
    TutorialView.markDone();
  }
}
