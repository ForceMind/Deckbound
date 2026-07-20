/**
 * 通用模态 —— 事件 / 背包 / 设置 / 结算等共用的弹窗构建器。
 * show() 返回 Promise，用户选择后 resolve。
 */
export class ModalView {
  constructor() {
    this.layer = document.getElementById('modal-layer');
  }

  /**
   * @param {object} opts
   *   title, bodyHTML, choices: [{ label, sub, disabled, value }]
   * @returns {Promise<any>} 选中项的 value
   */
  show({ title, bodyHTML = '', choices = [] }) {
    return new Promise((resolve) => {
      this.layer.innerHTML = '';
      this.layer.classList.remove('hidden');

      const box = document.createElement('div');
      box.className = 'modal-box';
      box.innerHTML = `${title ? `<h2>${title}</h2>` : ''}${bodyHTML}`;

      const list = document.createElement('div');
      list.className = 'modal-choices';
      for (const choice of choices) {
        const btn = document.createElement('button');
        btn.className = 'modal-choice';
        btn.disabled = !!choice.disabled;
        btn.innerHTML = `${choice.label}${choice.sub ? `<small>${choice.sub}</small>` : ''}`;
        btn.addEventListener('click', () => {
          this.hide();
          resolve(choice.value);
        });
        list.appendChild(btn);
      }
      box.appendChild(list);
      this.layer.appendChild(box);
    });
  }

  /** 自定义内容模态（自行管理关闭），返回容器元素 */
  showRaw() {
    this.layer.innerHTML = '';
    this.layer.classList.remove('hidden');
    const box = document.createElement('div');
    box.className = 'modal-box';
    this.layer.appendChild(box);
    return box;
  }

  hide() {
    this.layer.classList.add('hidden');
    this.layer.innerHTML = '';
  }
}
