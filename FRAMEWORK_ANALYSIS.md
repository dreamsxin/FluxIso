# LuxIso 框架分析报告
> 基于现代游戏框架设计理念（Godot / Unity DOTS / Bevy ECS / Phaser）
> 分析日期：2026-04-03

---

## 执行摘要

LuxIso 是一个**设计思路清晰、代码质量较高**的等距渲染引擎原型。它引入了 ECS 思想（Component 系统）、事件总线、对象池、A* 寻路、场景管理栈等现代框架概念，整体结构合理。但对照 Godot/Unity/Bevy 等先进框架的设计理念，存在若干**架构层面的系统性问题**和**Demo 级别的使用问题**，下文逐一展开。

---

## 一、架构层问题

### 1.1 【严重】ECS 是"伪 ECS"：Component 挂在 Entity 上而非 World

**现状：**
```
Entity (extends IsoObject)
  └── Map<string, Component>   ← 组件归属于对象实例
```

**问题：**
- 真正的 ECS（Unity DOTS / Bevy）中，Component 数据存储在连续内存（Archetype / SparseSet），System 批量处理同类 Component，CPU 缓存友好。
- 当前实现是**面向对象的组件模式（Component Pattern）**，而非数据驱动的 ECS。每个 Component 是独立堆对象，`Entity.update()` 逐个调用，缓存抖动严重。
- 没有 **System** 层：`MovementComponent.update()`、`HealthComponent.update()` 等逻辑散落在各 Component 自身，无法跨对象批量处理（如：同帧内所有角色寻路并行计算）。
- `componentType` 是字符串 key，`getComponent<T>('health')` 丢失类型安全（需要泛型转型）。

**改进方案：**
```typescript
// 引入 System 概念，将逻辑提到 Scene 层
class MovementSystem {
  update(dt: number, entities: Iterable<Entity>): void {
    for (const e of entities) {
      const mv = e.getComponent(MovementComponent);
      if (mv) mv.step(dt);
    }
  }
}

// Component 改用类引用作 key，消除字符串魔法
getComponent<T extends Component>(ctor: new(...a: any[]) => T): T | undefined
```

---

### 1.2 【严重】`topoSort` 深度排序：O(n²) 图构建 + `queue.shift()` 是 O(n³) 级别

**现状（`math/depthSort.ts`）：**
```typescript
for (let i = 0; i < n; i++) {
  for (let j = 0; j < n; j++) {     // O(n²) 对比
    if (isBehind(aabb[i], aabb[j])) {
      graph[i].push(j);
      inDegree[j]++;
    }
  }
}
// Kahn BFS
while (queue.length > 0) {
  const idx = queue.shift();   // ← Array.shift() 是 O(n)，整体变 O(n²)
```

- 对于 50 个对象：50×50 = 2500 次对比，尚可接受。
- 对于 200+ 对象（大地图场景）：40000 次对比，且 `result.includes(objects[i])` 在 fallback 分支又是 O(n²)。

**改进方案：**
1. `queue.shift()` → 改用双端队列（或简单的 index 指针 `let head = 0; queue[head++]`），消除 O(n) 位移。
2. 引入**脏标记 + 空间分区**：只对 AABB 相交的对象对做排序（四叉树/格子分区，提前过滤），大幅减少对比量。
3. 增量排序：仅对移动过的对象重新计算其局部排序关系（Godot 就是这样做的）。
4. `result.includes()` → 用 `Set<IsoObject>` 替代线性搜索。

---

### 1.3 【重要】`Scene._aabbSnapshot` 脏检测：JSON 字符串对比开销大

**现状（`Scene.ts` 内 `_aabbSnapshot`）：**
```typescript
private _aabbSnapshot: string = '';
// 每帧生成 JSON 字符串来判断是否需要重排
```

- 对 30 个对象每帧序列化 AABB 到字符串，GC 压力高。
- Godot 用版本号（dirty generation counter）或位掩码解决同样问题，O(1) 开销。

**改进方案：**
```typescript
// 每个 IsoObject 自带版本计数器，移动时自增
position.x = val; this._dirtyGen++;

// Scene 用一个聚合哈希（简单求和）代替字符串
private _sortGen = 0;
private _lastSortGen = -1;
// 对象 position 变化时 sortGen++，帧内比较两个数字即可
```

---

### 1.4 【重要】Engine._buildScene 硬编码所有类型：违反开放-封闭原则

**现状（`Engine.ts`）：**
```typescript
switch (p.type) {
  case 'crystal': prop = new Crystal(...); break;
  case 'boulder': prop = new Boulder(...); break;
  case 'chest':   prop = new Chest(...);  break;
}
```

- 用户无法扩展自定义 prop 类型而不修改引擎源码。
- Godot/Unity 的场景加载器通过**注册表（Registry）**解决这个问题。

**改进方案：**
```typescript
// PropRegistry：类型名 → 工厂函数
Engine.registerProp('crystal', (opts) => new Crystal(opts.id, opts.x, opts.y, opts.color));
Engine.registerProp('dragon',  (opts) => new Dragon(opts));  // 用户自定义

// buildScene 查表
const factory = Engine._propRegistry.get(p.type);
if (factory) prop = factory(p);
```
同样适用于 lights（omni/directional 硬编码分支）。

---

### 1.5 【重要】Camera 坐标变换与渲染耦合，缺少视口裁剪（Frustum Culling）

**现状：**
`Scene.draw()` 调用 `camera.applyTransform(ctx, ...)` 后对**所有对象**逐一 `obj.draw(dc)`，没有视口裁剪。

**问题：**
- 大地图（200+ 对象）时，屏幕外对象仍然执行 Canvas 绘图调用，浪费 GPU/CPU。
- Phaser/Unity 默认只渲染视口内的对象。

**改进方案：**
```typescript
// Camera 提供 isVisible(aabb) 方法
isVisible(aabb: AABB, tileW: number, tileH: number, canvasW: number, canvasH: number): boolean {
  const { sx, sy } = this.worldToScreen((aabb.minX + aabb.maxX)/2, ...);
  const margin = 64;
  return sx > -margin && sx < canvasW + margin && sy > -margin && sy < canvasH + margin;
}

// Scene.draw 中过滤
const visible = sorted.filter(o => this.camera.isVisible(o.aabb, ...));
```

---

### 1.6 【重要】`Pathfinder` 路径缓存是模块级全局变量，多场景时状态污染

**现状（`Pathfinder.ts`）：**
```typescript
let _cacheCollider: TileCollider | null = null;
let _cacheVersion  = 0;
const _cache = new Map<...>();
```

- 全局单例，多 Scene 或多 Pathfinder 实例时缓存互相污染。
- 场景切换后旧缓存不会立刻失效（需手动 `invalidateCache`）。
- 不支持同帧内两个不同 collider 并发查询。

**改进方案：**
将缓存封装为实例方法，或使用 `WeakMap<TileCollider, Map<string, IsoVec2[]>>` 的 per-collider 缓存，随 collider 对象生命周期自动回收。

---

### 1.7 【中等】`AssetLoader` 静态类 + 全局缓存：测试不友好，资源无法按场景卸载

**现状：** 全静态方法，`AssetLoader.cache` 永久持有图片引用。

**问题：**
- 无法按场景卸载资源（内存泄漏风险）。
- 单元测试需要 mock 静态类，困难。
- 不支持进度回调（大型游戏需要 loading 进度条）。

**改进方案：**
```typescript
class AssetLoader {
  private cache = new Map<string, HTMLImageElement>();
  async loadImage(url: string, onProgress?: (pct: number) => void): Promise<HTMLImageElement> { ... }
  unloadAll(): void { this.cache.clear(); }  // 场景卸载时调用
}
// 每个 SceneManager 持有自己的 AssetLoader 实例
```

---

### 1.8 【中等】`HealthComponent` 有双重回调路径，语义混乱

**现状：**
```typescript
// 构造时注入（私有）
private readonly _onDeathCb?: (owner: IsoObject) => void;
// 构造后设置（公有）
onDeath?: (owner: IsoObject) => void;
```
`takeDamage` 内部 **两者都会调用**，导致同一事件可能触发两次 onDeath（若两处都设置了）。

**改进方案：** 统一为单一 EventBus 事件（`bus.emit('death', ...)`），移除公有 callback 字段，或明确说明两者互斥。

---

### 1.9 【中等】`InputManager` 监听在 `window` 上：多实例时键盘事件冲突

```typescript
add(window, 'keydown', ...);  // 全局 window 监听
add(window, 'keyup',   ...);
```
- 多个 InputManager 实例（如 Editor + Game 同屏）会互相触发。
- Godot Input 系统是单例 + 事件过滤；Phaser 的 InputPlugin 也绑定在 Scene 生命周期上。

**改进方案：** 键盘事件绑定到 canvas 的 `tabIndex` 模式（`canvas.focus()` + canvas 上监听），或提供全局 InputManager 单例 + 各 Scene 订阅过滤。

---

## 二、具体组件改进清单

### 2.1 `depthSort.ts` — 性能热点

| 问题 | 当前 | 建议 |
|------|------|------|
| Kahn BFS 队列 | `queue.shift()` O(n) | 改用指针 `head` |
| fallback 检测 | `result.includes()` O(n) | 改用 `Set<IsoObject>` |
| 完整 O(n²) 对比 | 每帧全量 | 脏检测 + 空间分区 |

### 2.2 `TriggerZoneComponent` — 每帧 `new Set()`

```typescript
// 当前：每帧分配新 Set
const nowInside = new Set<string>();
```
对高频 trigger 场景产生 GC 压力。改为复用两个 Set（swap 清空策略）。

### 2.3 `Scene.toJson()` — 不序列化 Props

`toJson()` 输出 `walls / lights / characters / clouds`，但**缺少 props（crystal/boulder/chest）的序列化**，导致编辑器保存的场景丢失 prop 数据。

### 2.4 `ShadowCaster` — 每帧 `Array.from()` + 多次 `project()`

```typescript
// 对每个 caster 做 8 次或 4 次 project()，不缓存
Array.from({ length: 8 }, (_, i) => { ... project(...) ... })
```
可在 ShadowCaster 层引入 per-frame 暂存数组（通过 ObjectPool 或 preallocated array），避免每帧大量短生命周期数组。

### 2.5 `Character.update()` — 与 `MovementComponent` 逻辑重复

`Character` 自带一套 `_target / _waypoints / pathTo / moveTo` 逻辑，`MovementComponent` 是另一套完整的移动系统。两者并存，用户容易混淆应使用哪一套。

**建议：** 让 `Character` 完全依赖 `MovementComponent`，移除 `Character` 内的移动字段和方法，仅保留动画、渲染职责（单一职责原则）。

---

## 三、Demo 使用问题

### 3.1 【Bug】`example-02` —— `MovementComponent` 手动 `onAttach` 而非通过 `addComponent`

```typescript
// examples/02-character-movement/main.ts:54
const mv = new MovementComponent({ speed: 3.5, radius: 0.35, collider });
mv.onAttach(character);   // ← 手动调用，组件未加入 Entity._components
```

**问题：**
- `character._components` 里**没有** `MovementComponent`，`Entity.update()` 不会自动驱动它。
- 代码在 `engine.start()` 的 preFrame 回调里手动调 `mv.update(ts)`，绕过了组件系统，是反模式。
- 正确用法应为 `character.addComponent(mv)`，`Scene.update()` 会通过 `Entity.update()` → `Component.update()` 自动驱动。

```typescript
// 正确写法
const mv = character.addComponent(new MovementComponent({ speed: 3.5, radius: 0.35, collider }));
// 无需手动 mv.update(ts)
```

### 3.2 【Bug】`example-02` —— 箭头键位移绕过碰撞系统

```typescript
if (input.isDown('ArrowUp'))    character.position.y -= 0.05;
if (input.isDown('ArrowDown'))  character.position.y += 0.05;
// ...
```

直接修改 `position`，完全跳过 `collider.resolveMove()`，角色可以穿墙。

**正确做法：**
```typescript
// 通过 MovementComponent 提供的方向移动
if (input.isDown('ArrowUp'))    mv.move(0, -nudge);
// 或直接调用 collider.resolveMove 后再更新 position
```

### 3.3 【Bug】`example-03` —— EventBus 事件 payload 字段名不匹配

```typescript
// main.ts:75-77
globalBus.on<DamageEvent>('damage', ({ amount, target }) => {
  console.log(`[damage] ${target} took ${amount} damage`);
});
```

但 `EventBus.ts` 中 `DamageEvent` 定义为：
```typescript
export interface DamageEvent { amount: number; sourceId?: string }
```

**没有 `target` 字段**。`target` 始终是 `undefined`，日志永远输出 `"undefined took X damage"`。且 `HealthComponent.takeDamage()` 内部并未 emit 任何 `'damage'` 事件到 globalBus，此监听永远不会触发。

**修复：**
1. 将 `DamageEvent` 扩展：`interface DamageEvent { amount: number; targetId?: string; sourceId?: string }`
2. `HealthComponent.takeDamage()` 内调用 `this._bus?.emit('damage', { amount, targetId: this._owner?.id })`
3. 或在 demo 的 click handler 中手动 emit。

### 3.4 【设计问题】`example-02` —— `input.flush()` 调用时机错误

```typescript
engine.start(
  undefined,          // onFrame (post-draw)
  (ts) => {           // preFrame (pre-draw)
    // 处理输入...
    mv.update(ts);
    input.flush();    // ← flush 在 preFrame，但 onFrame 可能还需要 wasPressed
  },
);
```

`start(onFrame, preFrame)` 的第一个参数是 **post-frame**，第二个是 **pre-frame**。`flush()` 在 preFrame 末尾清除了单帧状态，问题不大；但若 `onFrame` 也需要 `wasPressed`，则已被清除。

**建议：** `flush()` 应在 **onFrame（post-draw）** 末尾调用，确保整帧内 `wasPressed` 有效。

### 3.5 【设计问题】`example-05` —— 天空渲染函数内联在 `main.ts`，超过 400 行

`_drawPlainsSky` / `_drawLakeSky` / `_drawDeepSky` 等私有函数直接写在 main.ts 末尾，大量魔法数字，可读性差。

**应拆分到：**
```
environment/PlainsSky.ts
environment/LakeSky.ts
environment/DeepSky.ts
```
与已有的 `DayNightCycle.ts` 保持一致风格。

### 3.6 【设计问题】`example-05` —— Hero 的 MovementComponent 在场景切换后仍绑定旧 collider

```typescript
const heroMv = new MovementComponent({ speed: 5.5, radius: 0.32, collider: plainsCollider });
// 场景切换到 lake 时，heroMv 的 collider 未更新
```

切换到湖水场景后，hero 寻路仍使用草原碰撞图，可能导致路径错误。应在 `onEnter` 钩子中 `heroMv.setCollider(lakeCollider)`。

---

## 四、缺失的现代框架特性

| 特性 | Godot/Unity | LuxIso 现状 | 建议优先级 |
|------|------------|------------|-----------|
| System 层（批量处理组件） | ✅ | ❌ 无 | 高 |
| 视口裁剪（Frustum Culling） | ✅ | ❌ 无 | 高 |
| 场景资源卸载 | ✅ | ❌ 无 | 高 |
| 组件依赖声明（requires）| ✅ | ❌ 无 | 中 |
| 多点触控 | ✅ | ❌ 仅单点 | 中 |
| 物理插值（FixedUpdate）| ✅ | ❌ 无 | 中 |
| 音频系统 | src/audio 目录存在但内容未见 | 待评估 | 中 |
| 地图块（Tilemap chunks）| ✅ | ❌ 整图绘制 | 低 |
| 调试绘制 API（DebugDraw）| ✅ | 部分（DebugRenderer）| 低 |

---

## 五、优先修复建议（按影响排序）

1. **`example-02`：`addComponent` 代替手动 `onAttach`** — 一行修改，修复组件系统不驱动 MovementComponent 的根本 bug。
2. **`depthSort.ts`：`queue.shift()` → 指针法 + `Set` 替换 `includes`** — 性能提升，对大场景立竿见影。
3. **`example-03`：补全 DamageEvent.targetId + HealthComponent 内 emit** — 修复永远不触发的事件监听。
4. **`example-02`：箭头键走路绕过碰撞** — 用 MovementComponent 的方向接口替代直接修改 position。
5. **`Engine._buildScene`：引入 PropRegistry** — 开放扩展，解除硬编码耦合。
6. **`Scene.toJson()`：补全 props 序列化** — 编辑器保存完整性。
7. **`TriggerZoneComponent`：复用 Set，避免每帧 new** — GC 优化。
8. **`Pathfinder` 缓存实例化** — 消除全局状态。
