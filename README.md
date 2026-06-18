# Myst · 神秘学星盘工作室

> A professional desktop astrology studio built with Electron. Create and manage
> birth profiles, then generate and explore natal, transit, progressed, return,
> synastry, composite and Davison charts on a beautiful interactive wheel.

![natal chart](tests/screenshots/2-natal.png)

## ✨ 功能概览 Features

- **档案管理** — 创建、编辑、删除个人档案，数据以 JSON 序列化保存在本地。每个档案包含：
  - 出生日期与时间（**公历，精确到分钟**）
  - 出生地（内置城市检索 + 手动经纬度），时区与历史夏令时由坐标自动推算
  - 性别、中文名、英文名、备注
- **个人星盘**：本命盘、行运盘、二次推运、太阳返照、月亮返照
- **合盘分析**：比较盘（Synastry）、组合中点盘（Composite）、戴维森时空中点盘（Davison）
- **专业星盘绘制**：手绘级 SVG 星盘轮，含黄道带、宫位、行星、四轴、相位连线、逆行标记
- **数据面板**：行星位置表、相位列表（按容许度排序）、元素与模式分布
- **多宫位系统**：Placidus / 整宫 / 等宫 / Regiomontanus / Topocentric / Koch
- **回归 / 恒星黄道** 切换，**星盘导出 SVG**

底层天文计算由开源专业占星库
[circular-natal-horoscope-js](https://github.com/0xStarcat/CircularNatalHoroscopeJS)
提供，时区换算使用 [luxon](https://github.com/moment/luxon)。

## 🚀 快速开始 Getting started

```bash
npm install        # 安装依赖（含 Electron）
npm start          # 启动应用
```

> 国内网络可在安装前设置 Electron 镜像：
> `set ELECTRON_MIRROR=https://mirrors.huaweicloud.com/electron/`

### 测试与验证 Testing

```bash
npm test           # 运行占星引擎单元/集成测试（纯 Node，无需界面）
npm run smoke      # 在真实 Electron 渲染进程中冒烟测试（含 SVG 校验）
```

`tests/Screenshot.js` 可生成各界面截图到 `tests/screenshots/`。

### 打包 Packaging

```bash
npm run dist       # 通过 electron-builder 生成安装包（Windows: NSIS）
```

## 🧭 文档 Documentation

- [功能文档 FeatureGuide](docs/FeatureGuide.md) — 每个功能与每种星盘的详细说明
- [架构文档 Architecture](docs/Architecture.md) — 分层设计、设计模式与数据流

## 🗂 数据存储 Data location

档案保存在 Electron 用户数据目录下：

```
<userData>/data/Profiles.json
```

（Windows 通常为 `%APPDATA%/Myst/data/Profiles.json`）

## 📁 目录结构 Project layout

```
src/
  core/            领域层（不依赖 Electron，可独立测试）
    models/        Profile / BirthData / GeoLocation 值对象与实体
    astrology/     占星引擎：适配器、相位引擎、策略、工厂、门面
    data/          内置城市数据
    util/          角度数学
  main/            Electron 主进程：窗口、IPC 路由、档案仓储
  preload/         contextBridge 安全桥接
  renderer/        界面层：视图、组件、SVG 星盘、状态管理
docs/              文档
tests/             测试与截图脚本
```

## 📜 License

MIT
