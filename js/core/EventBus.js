/**
 * 全局事件总线 —— 模块间解耦通信。
 * UI 监听游戏事件（statsChanged / combatStart / goldGained ...），
 * 游戏逻辑不直接持有 UI 引用，方便后续接服务器或替换渲染层。
 */
export class EventBus {
  constructor() {
    this._listeners = new Map();
  }

  on(event, handler) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    this._listeners.get(event)?.delete(handler);
  }

  emit(event, payload) {
    this._listeners.get(event)?.forEach((fn) => fn(payload));
  }
}

/** 全局单例 */
export const bus = new EventBus();
