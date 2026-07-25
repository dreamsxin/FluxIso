# LuxIso 架构分析报告 v5

> 更新日期：2026-07-25
> 基线：Canvas 2D 默认 + WebGL2 预览，265 个 Vitest 测试 / 36 个测试文件，9 个 Playwright WebGL 夹具

## 执行摘要

LuxIso 已从“功能完整的原型”推进到边界较清晰的 2D 等距引擎内核。v5 完成了 Scene 职责拆分、ECS System 层、构造函数组件查询、EventMap 类型事件、场景运行态序列化，以及深度排序队列优化。此前报告中的“缺少 System、缺少固定时间步、组件使用字符串 key、深度排序没有空间分区、InputManager 无 destroy”等结论均已失效。

当前主要限制不再是基础架构缺失，而是大规模场景下的进一步索引、定制类型序列化、Canvas 阴影投影缓存、音频空间化质量，以及 WebGL2 预览的 golden 审批和浏览器发布矩阵。

## 当前分层

```text
editor/                   开发工具，lib 构建明确排除
webgl-next/               独立 WebGL2 预览、快照提取、GPU 资源与浏览器夹具
core/Engine               RAF、固定时间步、JSON 构建、类型注册表
core/Scene                对象/光源容器、生命周期、相机、System 调度
core/SceneRenderer        剔除、遮挡排序、阴影、lightmap、绘制
core/SceneSerializer      内置 schema 与运行态导出
ecs/                      Entity、Component、System、EventBus、组件
elements/lighting         可渲染对象与光源
physics/animation/audio   碰撞寻路、动画粒子、音频
math/                     投影、颜色、深度排序
```

依赖方向仍以 core 协调基础模块为主。`SceneRenderer` 和 `SceneSerializer` 通过 `type` 引用 Scene，未引入运行时循环依赖。

`webgl-next` 通过 renderer-neutral `RenderSnapshot` 读取同一 Scene 状态，尚未成为公共 `Engine` 构造选项；Canvas2D 仍是已发布库的默认后端。

## WebGL Next 预览

- `SceneExtractor` 已覆盖内置 Floor、Wall、Character、Crystal、Boulder、Chest、Tree、FlowerPatch、Lantern、Cloud、粒子和浮动文本。
- WebGL2 已具备环境光、方向光、点光、全局光、解析阴影投影、GPU shadow mask 缓存、纹理、混合、ID picking、小地图和 DOM 文本桥接。
- 预览场景支持固定步长 A* 点击移动，同时保留 Canvas2D 对照和 fallback。
- 9 个 URL 夹具覆盖四向视图、低/高俯角、夜景、仅全局光和全部灯光禁用。
- Playwright 使用固定 Chromium/SwiftShader、1280×720、DPR 1 验证非空像素和跨帧稳定性，并产出待审批截图；1.5% golden diff 尚未启用为阻断门槛。

## v5 已完成

### Scene 职责拆分

- `Scene.ts` 从 643 行降至约 255 行。
- `SceneRenderer` 持有 lightmap、剔除缓冲区、排序缓存和阴影缓存。
- `SceneSerializer` 负责内置对象与运行态 JSON 导出。
- `Scene.draw()` / `Scene.toJSON()` 公共 API 保持不变。
- lightmap 会在画布尺寸变化时 resize。
- 排序哈希包含对象身份与 AABB，修复同坐标对象交换可见性时复用旧缓存的问题。

### ECS System 层

```ts
class DeathSystem extends System {
  readonly query = [HealthComponent];
  update(entities: Entity[], dt: number): void {
    for (const entity of entities) {
      if (entity.getComponent(HealthComponent)?.isDead) {
        this.scene?.removeById(entity.id);
      }
    }
  }
}

scene.addSystem(new DeathSystem());
```

- System 按 priority 稳定排序。
- 支持 variable update 与 fixedUpdate。
- 查询要求实体具备全部组件构造函数。
- 匹配数组复用，支持运行时添加/移除组件及可见性变化。
- 具备 attach/detach 生命周期和跨 Scene 实例保护。

### ECS 契约统一

- `Entity` 的 Map key 为组件构造函数引用。
- `Validator.requireComponent()` / `validateComponents()` 已迁移到 `ComponentCtor`。
- 同类型组件替换会先调用旧组件 `onDetach()`。
- `componentType` 仅保留为可选诊断标签，不参与查询。

### 类型安全 EventBus

```ts
interface GameEvents {
  damage: { amount: number };
  score: { value: number };
}

const bus = new EventBus<GameEvents>();
```

事件名与 payload 由同一个 EventMap 约束。默认 `new EventBus()` 仍是开放字符串总线，`globalBus` 使用内置 `LuxIsoEventMap`。组件只依赖所需事件的 `EventEmitter<Pick<...>>`，允许应用扩展事件集合。

### 序列化闭环

内置 schema 现可往返：

- Scene 名称、尺寸、环境光、dynamicLighting、IsoView
- Camera x/y/zoom/lerpFactor
- 光源 ID、enabled、全局光、falloff、方向与强度
- Floor、Wall、Character、Cloud、Crystal、Boulder、Chest
- Health 最大值与 TileCollider walkable 网格

自定义 prop/light 可通过 Engine 注册表反序列化；自定义 prop 的自动序列化仍需要后续 serializer registry。

### 深度排序

- 2D 空间桶限制候选 AABB 对。
- 数字 pair key 去重。
- min-heap Kahn queue 将队列操作降为 O(log n)。
- 移除了 orphan 全局二次比较和 `globalThis` 调试写入。
- `Scene.sortedObjects` 提供显式诊断入口。

稠密对象全部落入同一桶时，候选图构建仍可能退化为 O(n²)；这是 broad phase 的最坏情况，不代表每帧固定两两比较。静态场景会复用排序缓存。

## 剩余问题

| 优先级 | 问题 | 建议 |
|---|---|---|
| P0 | example-05 场景切换后 hero collider 可能仍指向旧场景 | 在场景 onEnter 更新 MovementComponent collider |
| P1 | example-05 天空绘制函数仍集中在 main.ts | 拆到 environment 模块 |
| P1 | 自定义 prop 没有配套 serializer registry | 为注册表增加 serialize 回调或独立注册 API |
| P2 | System 每次调度扫描所有 Entity × System | 达到千级实体后引入 query/archetype 缓存 |
| P2 | 稠密深度桶仍可能 O(n²) | 基准验证后考虑 sweep-and-prune 或分层 chunk |
| P1 | WebGL golden 基线尚未审批 | 审阅 CI 候选图后固化基线并启用 1.5% diff 门槛 |
| P1 | WebGL context-loss / 资源泄漏尚无自动化 | 增加强制丢失、恢复和重复 dispose 浏览器测试 |
| P2 | Canvas2D ShadowCaster 会重复投影静态 caster | 按 caster/light/view 快照缓存投影轮廓；WebGL 路径已缓存 |
| P2 | 双 Z 单位仍是公开 API 认知成本 | 新主版本统一世界高度单位；旧 API 提供显式转换 |
| P3 | 空间音频仍为手算距离衰减 | 使用 Web Audio PannerNode + HRTF |
| P3 | 地图未分块 | 大地图引入 tile chunks 与脏区重绘 |

## 当前评价

| 维度 | 评分 | 说明 |
|---|:---:|---|
| 模块分层 | 9/10 | Scene 渲染与序列化职责已拆分 |
| ECS 设计 | 8/10 | 构造函数查询、System、生命周期完整；尚无 archetype |
| 渲染管线 | 8/10 | Canvas 完整；WebGL 预览已覆盖核心 pass，尚待 golden 和浏览器矩阵 |
| 类型安全 | 9/10 | ComponentCtor 与 EventMap 覆盖核心扩展面 |
| 可扩展性 | 8/10 | 加载注册表与自定义事件良好；序列化注册表待补 |
| 文档质量 | 8/10 | README 与本报告已同步当前实现 |
| 测试覆盖 | 8/10 | 265 个单测 + 9 个浏览器夹具；尚无覆盖率和 approved golden 门槛 |
| 综合 | 8.3/10 | 架构短板已大幅收敛，下一阶段应由 profiling 驱动 |

测试数量不等于覆盖率。后续应加入 coverage 报告与关键模块阈值，而不是只追求用例数量。
