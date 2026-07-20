# 🂠 Deckbound · 命运牌阵

> 在无尽牌阵中，走出你自己的命运之路。

Roguelike + 地图探索 + 卡牌世界 + 自动战斗。整个世界由无限扑克牌组成 —— 你不是抽牌，而是**在牌上移动**。牌阵不是静态的：怪物会游荡，商人会离开，宝箱会被其他冒险者打开，火焰会蔓延，诅咒会扩散。

主线故事共五章（迷雾边境 → 白骨荒原 → 燃烧深渊 → 镜像回廊 → 命运王座），每 10 层一位守关首领，抵达第 50 层击败最终首领即可通关，之后可继续无尽模式。界面默认中文，设置中可切换英文；首次游玩自动播放分步新手引导（设置里可重看）；已适配手机移动端。

## 核心规则

- **视野**：只能看到两行。第一行（近处）中间 5 张可见、可点击；第二行（远方）仅正前方 3 张可见，只能观察。
- **移动**：正前方 3 张免费通行；更远的每格消耗 1 体力。每前进 3 层因长途跋涉自动消耗 1 体力。
- **体力恢复**：休息（+1），以及清泉 ⛲、营地 🏕️、食物 🍖、神龛 ⛩️ 等卡牌。
- **休息**：恢复体力的同时，视野内两行（含未翻开的牌背）全部重新洗牌。
- **战力**：独立成长值，只靠击败敌人提升；点击怪物立即自动战斗，战力高者胜。
- **装备栏**：拾取装备不顶掉现有装备——可选择装备（旧的收入背包）、收入背包或折价卖出；背包中的装备随时点击与身上互换。
- **牌阵演化**：每回合怪物游荡、商人离开、宝箱被抢、火焰蔓延、诅咒扩散。
- **演出舞台**：牌阵留白区有牌背漂浮氛围动画；移动端竖屏空白区显示章节徽章与金币/战力/伤害事件动画。

## 运行

需要通过本地静态服务器访问（ES Module + fetch 配置，`file://` 协议无法加载）：

```bash
npm start          # 即 npx http-server -p 8080 -c-1 .
# 打开 http://127.0.0.1:8080
```

## 部署到 Cloudflare Pages

本项目是纯静态站点，无需构建：

- **方式一（上传压缩包/文件夹）**：Cloudflare Dashboard → Workers & Pages → Create → Pages → Upload assets，上传 `deckbound-cfpages.zip`（或解压后的文件夹）即可。
- **方式二（连 Git）**：连接仓库，Build command 留空，Build output directory 填 `/`。

重新打包：`powershell -c "Compress-Archive -Path index.html,css,js,data -DestinationPath deckbound-cfpages.zip -Force"`

## 玩法

- 地图宽 9 列，玩家在底部；只能看到两行：**第一行**（近，中间 5 张可见，可点击）与**第二行**（远，正前方 3 张可见，只能观察）
- 点击第一行的牌移动：横向每格 1 体力 + 前进 1 体力（点远处的牌自动走完整条路线）
- 键盘：`←`/`→`/`↑`（或 A/D/W）移动，`R` 休息
- **Rest**：恢复 1 体力，第一行重新洗牌（第二行不变）
- **战力（Power）**是独立成长值：击败敌人获得战力，不靠升级；点击怪物立即自动战斗（约 3 秒演出）
- 每 10 层出现 Boss（会在第二行提前预告）；镜像行者的战力永远接近你自己
- 死亡失去一切，但保留 Meta 进度：最高层数、Boss 击杀数、解锁职业（狂战士 / 死灵法师）

## 架构

```
data/            全部数值配置（JSON，代码零硬编码数值）
js/core/         EventBus · RNG(可播种) · DataLoader · SaveMeta · Game(主控流程)
js/entities/     Card · Player
js/map/          MapGenerator(按层数动态权重) · World(网格/滚动/可见性) · WorldDrift(世界演化)
js/combat/       Combat(战力对比) · CardEffects(卡牌行为注册表)
js/ui/           UIManager · HUD · BoardView · CombatView · ModalView · ShopView · EventView
js/anim/         Animator(promise 化动画)
```

模块间通过 EventBus 解耦：游戏逻辑广播事件（`statsChanged` / `goldGained` / `worldScrolled`…），UI 被动渲染，方便后续替换渲染层或接服务器。

## 扩展指南

- **新卡牌种类**：`data/cardTypes.json` 加一行 + `js/combat/CardEffects.js` 注册一个 handler + `data/spawn.json` 配权重
- **新怪物 / 武器 / 护甲 / 食物 / 事件 / 职业**：只改对应 JSON
- **生成曲线**：`data/spawn.json` 的 `floorScaling`（层数增益）、`floorMinimum`（出现下限）、`maxPerRow`
- **稀有度**：`data/rarities.json`（权重随层数上浮，装备数值按稀有度倍率缩放）
- **世界演化概率**：`data/config.json` 的 `drift` 段
- **每日挑战 / 赛季**（预留）：`RNG` 支持种子，同一 seed 生成同一片牌阵（设置面板可查看当前 seed）
- 其余预留方向：PVP、排行榜、神器、技能树、宠物、天赋、Biome、天气、昼夜、元素、Boss 技能 —— 均可通过新增 JSON + 注册 handler 的方式挂接，不需改动核心流程
