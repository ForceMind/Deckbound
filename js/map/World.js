import { bus } from '../core/EventBus.js';

/**
 * 世界网格 —— 维护当前可见的牌阵状态。
 * - near：第一行（玩家下一步进入），中间 5 张可见
 * - far： 第二行（只能观察），正前方 3 张可见
 * 玩家前进后整体滚动：near 成为玩家所在行，far 变 near，顶部生成新 far。
 */
export class World {
  constructor(config, generator) {
    this.config = config;
    this.generator = generator;
    this.cols = config.grid.cols;

    this.floor = 1;                     // 玩家当前所在层
    this.near = generator.generateRow(this.floor + 1);
    this.far = generator.generateRow(this.floor + 2);
  }

  get nearFloor() { return this.floor + 1; }
  get farFloor() { return this.floor + 2; }

  /** 第一行可见窗口（以玩家为中心 5 张，贴边时收拢） */
  nearVisibleSet(playerCol) {
    return this._window(playerCol, this.config.grid.nearVisible);
  }

  /** 第二行可见窗口（正前方 3 张） */
  farVisibleSet(playerCol) {
    return this._window(playerCol, this.config.grid.farVisible);
  }

  _window(center, size) {
    const half = Math.floor(size / 2);
    let start = Math.max(0, Math.min(center - half, this.cols - size));
    const set = new Set();
    for (let i = 0; i < size; i++) set.add(start + i);
    return set;
  }

  /** 玩家进入 near[col] 后调用：世界向前滚动一层 */
  scroll() {
    this.floor += 1;
    this.near = this.far;
    this.far = this.generator.generateRow(this.farFloor);
    bus.emit('worldScrolled', this);
  }

  /** Rest：视野内两行（近处与远方，含未翻开的）全部重新随机刷新 */
  reshuffleRows() {
    this.near = this.generator.generateRow(this.nearFloor);
    this.far = this.generator.generateRow(this.farFloor);
    bus.emit('rowsReshuffled', this);
  }

  cardAt(row, col) {
    return (row === 'near' ? this.near : this.far)[col] ?? null;
  }

  setCard(row, col, card) {
    (row === 'near' ? this.near : this.far)[col] = card;
  }
}
