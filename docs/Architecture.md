# Myst 架构文档 · Architecture

本文件说明 Myst 的分层设计、所用设计模式、数据流与编码规范。设计目标：
**高内聚、低耦合、可测试、可替换底层依赖**。

---

## 1. 进程与分层 Process & layers

Myst 是一个 Electron 应用，遵循官方安全基线（`contextIsolation: true`、
`nodeIntegration: false`、最小化 preload 暴露面）。代码分为三层：

```
┌─────────────────────────── Renderer (sandboxed) ───────────────────────────┐
│  src/renderer  视图 / 组件 / SVG 星盘 / 状态管理（纯 UI，无 Node 依赖）        │
│        │  仅通过 window.mystApi 调用                                         │
└────────┼────────────────────────────────────────────────────────────────────┘
         │ contextBridge
┌────────┼──────────────────────── Preload ───────────────────────────────────┐
│  src/preload/Preload.js  受控、最小化的 IPC 桥（{ ok, data|error } 信封）      │
└────────┼────────────────────────────────────────────────────────────────────┘
         │ ipcRenderer.invoke
┌────────┼──────────────────────── Main process ──────────────────────────────┐
│  src/main   窗口生命周期 / IpcRouter（中介者） / ProfileRepository（仓储）     │
│        │                                                                      │
│  src/core   领域层（不依赖 Electron）：模型 + 占星引擎 + 数据 + 工具           │
└──────────────────────────────────────────────────────────────────────────────┘
```

**关键边界**：`src/core` 完全不依赖 Electron，可用纯 Node 直接单元测试
（见 `tests/RunAll.js`）。所有跨进程数据均为可结构化克隆的纯对象。

---

## 2. 设计模式 Design patterns

| 模式 | 位置 | 作用 |
| --- | --- | --- |
| **值对象 Value Object** | `core/models/GeoLocation`、`BirthData` | 不可变、自校验的领域值 |
| **实体 / 聚合根 Entity** | `core/models/Profile` | 档案聚合，序列化的唯一权威 |
| **仓储 Repository** | `main/ProfileRepository` | 把「档案集合」与 JSON 文件存储解耦（原子写） |
| **适配器 Adapter** | `astrology/HoroscopeAdapter` | 封装第三方占星库，输出规范化帧；更换天文后端只动此处 |
| **策略 Strategy** | `astrology/strategies/*` | 每种星盘一套构建逻辑，共享基类 `ChartStrategy` |
| **工厂 Factory** | `astrology/ChartStrategyFactory` | 由类型令牌创建并装配策略，集中依赖注入 |
| **门面 Facade** | `astrology/AstrologyService` | 引擎唯一入口：校验→选策略→产出 DTO |
| **中介者 Mediator** | `main/IpcRouter` | 渲染层与服务的唯一通道，统一错误信封 |
| **观察者 Observer** | `renderer/Store`、`EventBus` | 状态变更通知视图；解耦的全局信号（toast） |
| **组合根 Composition Root** | `main/Main`、`renderer/App` | 集中装配协作者，其余类不关心构造 |
| **依赖注入 DI** | 策略经 `deps` 注入适配器/相位引擎 | 便于以假对象测试 |

---

## 3. 占星引擎数据流 Engine data flow

```
ChartRequest ──► AstrologyService(Facade)
                   │  校验 + 规范化 subject（Profile.validate）
                   ▼
              ChartStrategyFactory ──► 具体 Strategy
                   │                      │
                   │   HoroscopeAdapter ◄─┤ 起盘（castFromLocal / castFromInstant）
                   │   AspectEngine     ◄─┤ 盘内/跨盘相位
                   │   ReturnFinder     ◄─┘ 返照时刻根查找（太阳/月亮返照）
                   ▼
              ChartData(纯 DTO，已富化符号/星座/度数/分布) ──► IPC ──► Renderer
```

- **帧 Frame**：`HoroscopeAdapter` 输出的最小数值结构（points / houses / angles /
  instantUtc / julianDate）。
- **富化 DTO**：`ChartData` 把帧 + 相位富化为含符号、星座、度分秒、宫位、元素分布的
  展示对象，渲染层无需任何占星知识即可绘制。
- **单环 vs 双环**：DTO 用 `rings: [...]` 表达；1 环为本命/返照/组合/戴维森，
  2 环为行运/推运/比较（内环主体、外环叠加）。

### 3.1 时间与时区
- 本命盘以**当地民用时**直接起盘，时区/DST 由坐标推算（库内置历史时区数据）。
- 行运/推运/返照需要**绝对时刻**：先由坐标解析 IANA 时区，用 luxon 将 UTC 时刻
  转为当地民用字段，再起盘——保证宫位按地点正确计算。

---

## 4. 渲染层 Renderer

- **无框架**：以 `Dom.js`（微型 hyperscript）声明式构建 DOM，零运行时依赖。
- **Store / EventBus**：观察者模式管理 `profiles`、`selectedPrimaryId`，并广播 toast。
- **ApiClient**：拆封 `{ ok, data|error }` 信封，失败即抛错，集中桥接依赖。
- **视图 Views**：`ProfilesView`（档案）、`ChartView`/`SynastryView`
  （均为共享 `ChartWorkbenchView` 的薄特化）。
- **ChartWheel**：纯函数式 SVG 生成器（`toSvg` 无 DOM 依赖，易快照测试），
  负责黄道带、刻度、宫位、四轴、相位连线与行星避让布局。

---

## 5. 编码规范 Conventions

- **文件名**：大驼峰 `PascalCase`（如 `ChartStrategyFactory.js`）。
- **变量/函数**：小驼峰 `camelCase`；常量 `UPPER_SNAKE_CASE`。
- **不可变值对象**：构造后 `Object.freeze`，并提供 `toJSON` / `fromJSON`。
- **错误处理**：领域层抛中文可读错误；IPC 层统一转为 `{ ok:false, error }`。
- **可测试性**：核心逻辑不触碰 Electron / DOM；协作者经构造注入。

---

## 6. 测试策略 Testing

| 层级 | 工具 | 覆盖 |
| --- | --- | --- |
| 引擎单元/集成 | `tests/RunAll.js`（纯 Node） | 角度数学、模型校验、相位引擎、八种星盘、返照精度 |
| 渲染冒烟 | `tests/SmokeRenderer.js`（真实 Electron） | 桥接、外壳渲染、IPC 起盘、SVG 合法性、控制台无报错 |
| 视觉回归 | `tests/Screenshot.js` | 关键界面截图 |

---

## 7. 可扩展点 Extension points

- **新增星盘类型**：实现一个 `ChartStrategy` 子类，在 `ChartStrategyFactory`
  注册，并在 `AstrologyService.CHART_TYPES` 增加目录项——渲染层自动适配其选项控件。
- **更换天文后端**：仅重写 `HoroscopeAdapter`，保持帧结构不变即可。
- **新增宫位/相位**：扩展 `astrology/Constants.js` 即可。
