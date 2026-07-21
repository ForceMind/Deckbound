/**
 * 数据加载器 —— 启动时一次性拉取全部 JSON 配置。
 * 所有数值均来自 data/ 目录，代码中不写死数值，方便调参和后续服务器下发。
 */
const FILES = {
  config: 'data/config.json',
  cardTypes: 'data/cardTypes.json',
  monsters: 'data/monsters.json',
  weapons: 'data/weapons.json',
  armors: 'data/armors.json',
  items: 'data/items.json',
  events: 'data/events.json',
  classes: 'data/classes.json',
  rarities: 'data/rarities.json',
  spawn: 'data/spawn.json',
  story: 'data/story.json',
  relics: 'data/relics.json',
};

export class DataLoader {
  constructor() {
    this.data = {};
  }

  async loadAll() {
    const entries = await Promise.all(
      Object.entries(FILES).map(async ([key, path]) => {
        const res = await fetch(path);
        if (!res.ok) throw new Error(`加载配置失败: ${path} (${res.status})`);
        return [key, await res.json()];
      })
    );
    for (const [key, json] of entries) this.data[key] = json;
    return this.data;
  }

  get(key) {
    return this.data[key];
  }
}
