# LuxIso 框架对比分析报告 v2
> 对照 Excalibur.js · Phaser 3 · Godot 4 · Unity DOTS · Bevy ECS  
> 分析日期：2026-04-03（第二次，含已修复项）

---

## 执行摘要

LuxIso 在上一轮修复后已解决所有高优先级 Bug（ECS 组件驱动、碰撞穿墙、事件字段名等），并完成三项核心性能优化（视锥剔除 in-place、PathCache 实例化、AssetLoader 可实例化）。与先进框架对比，项目已具备生产级原型的基础；但仍存在若干**架构层面**和**功能层面**的差距，下文按影响等级排序分析。

---

## 一、已完成修复（对比上一版分析）

| 上版问题 | 状态 | 解决方案 |
|----------|------|----------|
| `example-02` 手动 `onAttach` 绕过组件系统 | ✅ 已修复 | 改为 `addComponent(mv)`，由 Entity 驱动 |
| `example-02` 箭头键直接修改 position | ✅ 已修复 | 改用 `mv.nudge(dx, dy)` 碰撞解算 |
| `example-03` DamageEvent 字段 `target` → `targetId` | ✅ 已修复 | 扩展接口 + HealthComponent emit |
| `HealthComponent` 双回调路径混乱 | ✅ 已修复 | 统一单 EventBus 路径 |
| `Engine._buildScene` 硬编码 switch | ✅ 已修复 | `PropRegistry` / `LightRegistry` |
| `Scene.toJSON()` 不序列化 Props | ✅ 已修复 | 补全 Crystal/Boulder/Chest 序列化 |
| `TriggerZoneComponent` 每帧 new Set | ✅ 已修复 | 预分配双 Set swap |
| `depthSort.ts` O(n²) 热点 | ✅ 已修复 | 头指针替代 shift()；Set 替代 includes |
| `Scene._aabbSnapshot` 字符串脏检测 | ✅ 已修复 | `_sortHash` 数字哈希（Math.imul） |
| 视锥剔除每帧三次 `.filter()` | ✅ 已修复 | 单循环 + `_frustumCull` in-place |
| `Pathfinder` 模块级全局缓存 | ✅ 已修复 | `PathCache` 实例化，per-scene 隔离 |
| `AssetLoader` 全静态，无法按场景卸载 | ✅ 已修复 | 改为实例 + 静态委托模式 |

---

## 二、仍存在的架构问题

### 2.1 【高】ECS 缺少 System 层 — 无法批量跨实体处理

**对比参照：Excalibur.js / Bevy ECS**

Excalibur 的 System 模型：
```ts
// Excalibur 中，System 接收所有匹配 Query 的 Entity 批量处理
class MovementSystem extends System {
  query = new Query([MovementComponent, TransformComponent]);
  update(entities: Entity[], dt: number) {
    for (const e of entities) { /* 批量 */ }
  }
}
```

LuxIso 现状：
```ts
// 每个 Component 自己 update，逻辑分散，无法批量
class MovementComponent extends Component {
  update(ts?: number) { /* 只处理自己 */ }
}
```

**影响：**
- 无法在同一帧内对所有 MovementComponent 做批量 A* 查询（并行化潜力为零）
- 无法对所有 HealthComponent 做统一的死亡清理（需要各自回调）
- `componentType` 是字符串 key，`getComponent<T>('health')` 丢失类型安全

**改进方案（渐进式，不需要完全重写）：**
```ts
// Step 1: 改用类引用作为 key（类型安全）
addComponent<T extends Component>(c: T): T
getComponent<T extends Component>(ctor: abstract new(...a: any[]) => T): T | undefined

// Step 2: 在 Scene 层增加 System 注册，Scene.update() 优先运行 System
scene.addSystem(new MovementSystem());
scene.addSystem(new HealthSystem());
```

---

### 2.2 【高】`Character` 与 `MovementComponent` 逻辑重复 — 单一职责缺失

**对比参照：Godot 4 CharacterBody2D + 外部移动逻辑**

`Character` 内部有完整的 `_target / _waypoints / pathTo / moveTo` 移动实现；`MovementComponent` 也是另一套完整移动系统。两者并存导致：
- 用户不知道用哪套 API（`character.moveTo(x,y)` vs `mv.pathTo(x,y)`）
- `character.update()` 内部驱动自身移动，绕过组件系统
- 如果同时存在两套移动逻辑，位置冲突难以调试

**改进方案：**
- `Character` 移除内部 `_target / _waypoints / pathTo / moveTo` 字段和方法
- 保留动画、渲染、外观职责
- 移动完全依赖 `MovementComponent`（或将 ClickMover 作为辅助控制器）
- 短期内至少在文档中明确说明两套 API 的使用边界

---

### 2.3 【高】`InputManager` 绑定在 `window`，多实例时冲突

**对比参照：Phaser 3 InputPlugin（绑定到 Scene 生命周期）**

```ts
// 当前：全局 window 监听
window.addEventListener('keydown', handler);
```

**影响：**
- 多个 InputManager 实例（如 Editor + Game 同屏）互相触发
- 场景切换后旧的 InputManager 不会自动解绑（内存泄漏）
- InputManager 缺少 `destroy()` 方法

**改进方案：**
```ts
// 方案 A：绑定在 canvas（tabIndex 模式）
canvas.tabIndex = 0;
canvas.addEventListener('keydown', handler);

// 方案 B：全局单例 + 订阅过滤（推荐，与 SceneManager 联动）
InputManager.global.onKey('ArrowUp', handler, { scene: currentScene });
// SceneManager.pop() 时自动解绑

// 必须新增 destroy()
destroy(): void {
  window.removeEventListener('keydown', this._onKeyDown);
  window.removeEventListener('keyup', this._onKeyUp);
  window.removeEventListener('pointermove', this._onMove);
  window.removeEventListener('pointerdown', this._onDown);
  window.removeEventListener('pointerup', this._onUp);
}
```

---

### 2.4 【中】深度排序仍是 O(n²) 图构建 — 大场景性能瓶颈

已修复 Kahn BFS 的 `queue.shift()` 和 `includes()` 热点，但根本问题未解决：**每帧对所有对象对做 n×n AABB 比较**。

**对比参照：Godot 4 2D 渲染层** — 只对 AABB 相交的对象对排序，用空间分区（BVH）预过滤。

| 场景规模 | 当前比较次数 | 空间分区后（估算） |
|---------|------------|------------------|
| 50 对象 | 2,500 | ~200 |
| 200 对象 | 40,000 | ~800 |
| 500 对象 | 250,000 | ~2,000 |

**改进方案：**
```ts
// 1. 按 depthKey 初步排序（O(n log n)），只对相邻桶内对象比较
// 2. 引入列网格（column grid）：同一等深线上才可能有遮挡关系
// 3. 增量更新：只有移动过的对象重新计算其局部排序（版本计数）
```

---

### 2.5 【中】无固定时间步（Fixed Timestep / FixedUpdate）

**对比参照：Unity FixedUpdate / Phaser 3 `fixedUpdate`**

当前物理（`TileCollider.sweepMove`）和寻路（`MovementComponent`）都在可变帧率的 `requestAnimationFrame` 里运行。高帧率（144Hz）会导致相同时间内更新次数不同，低帧率（30Hz）时碰撞检测可能"穿越"薄墙。

**改进方案（标准 semi-fixed timestep）：**
```ts
// Engine 内部维护 accumulator
const FIXED_DT = 1 / 60;
this._accumulator += rawDt;
while (this._accumulator >= FIXED_DT) {
  scene.fixedUpdate(FIXED_DT);  // 物理/寻路在这里
  this._accumulator -= FIXED_DT;
}
scene.draw(ctx, this._accumulator / FIXED_DT);  // 插值 alpha
```

---

### 2.6 【中】`ShadowCaster` 每帧 `Array.from()` 多次 `project()`

```ts
// 当前：每个 caster 每帧 4-8 次 project()，无缓存
Array.from({ length: 8 }, (_, i) => { project(...) });
```

**改进方案：**
- 引入 per-caster 的"上帧位置"缓存，position 不变则复用投影结果
- 使用预分配 Float32Array 存储投影点，避免短生命周期对象

---

### 2.7 【中】`AudioManager` 空间音频用 2D 距离衰减，缺少 Web Audio API 原生 PannerNode

现状：`spatialVolume()` 是手算线性衰减，绕过 Web Audio API 的原生 3D 音频图。

**对比参照：Phaser 3 Sound** — 通过 `PannerNode` 实现真正的双耳立体声定位。

**改进方案：**
```ts
// 使用 PannerNode 替代手算 volume
const panner = ctx.createPanner();
panner.panningModel = 'HRTF';
panner.setPosition(worldX / scale, 0, worldY / scale);
ctx.listener.setPosition(listenerX / scale, 0, listenerY / scale);
src.connect(panner).connect(sfxBus);
```

---

### 2.8 【低】`ObjectPool` 存在但未集成到粒子系统和 FloatingText

`src/core/ObjectPool.ts` 已实现池化，但 `ParticleSystem` 仍在每帧 `new Particle()` / `splice()` 删除。FloatingText 也是每次 `new` 然后靠计时器 remove。

**改进方案：** `ParticleSystem` 内部使用 `ObjectPool<Particle>` 管理粒子生命周期；`Scene.spawnFloatingText()` 从池子取/还。

---

### 2.9 【低】场景资源生命周期：SceneManager 未触发 AssetLoader 卸载

SceneManager 在 `onExit` 后无自动清理场景资源逻辑。虽然 `AssetLoader` 现在支持实例化，但 SceneManager 的 `ManagedScene` 接口未包含 `assetLoader` 字段，开发者需手动在 `onExit` 中调用 `loader.clear()`。

**改进方案：**
```ts
export interface ManagedScene {
  scene: Scene;
  assetLoader?: AssetLoader;  // 新增：由 SceneManager 在 onExit 后自动 clear
  onEnter?(): void | Promise<void>;
  onExit?():  void | Promise<void>;
  // ...
}
// SceneManager.pop() 内：
if (top.managed.assetLoader) top.managed.assetLoader.clear();
```

---

## 三、缺失的现代框架特性

| 特性 | Excalibur / Phaser | Godot 4 | LuxIso 现状 | 建议优先级 |
|------|--------------------|---------|-------------|-----------|
| System 层（批量处理） | ✅ | ✅ | ❌ | **高** |
| 固定时间步（FixedUpdate） | ✅ | ✅ | ❌ | **高** |
| 组件依赖声明（requires） | ✅ Excalibur | ✅ | ❌ | 中 |
| 深度排序空间分区 | ✅（BVH/chunk） | ✅ | ❌（O(n²)） | 中 |
| InputManager.destroy() | ✅ | ✅ | ❌ | 中 |
| Web Audio PannerNode 空间化 | ✅ Phaser | ✅ | ❌（手算衰减） | 中 |
| 粒子 ObjectPool 集成 | ✅ | ✅ | ❌（每帧 new） | 低 |
| 多点触控 | ✅ | ✅ | ❌（仅单点） | 低 |
| 地图分块（Tilemap chunks） | ✅ | ✅ | ❌（整图绘制） | 低 |
| 原生 WebGL 渲染 | ✅ Pixi/Phaser | ✅（Vulkan） | ❌（Canvas 2D） | 低 |
| Shader / GLSL 支持 | ✅ | ✅ | ❌ | 低 |

---

## 四、待完成的 example-05 技术债

| 问题 | 影响 | 状态 |
|------|------|------|
| Hero `MovementComponent.collider` 在场景切换后仍绑定旧 collider | 碰撞/寻路错误 | ❌ 未修复 |
| `_drawPlainsSky` / `_drawLakeSky` 等 400+ 行内联在 `main.ts` | 可读性差 | ❌ 未修复 |

---

## 五、优先改进路线图

### P0 — 立即（正确性）
1. **`example-05`：场景切换时更新 hero MovementComponent collider** — 一处 `onEnter` 里调用 `heroMv.setCollider(newCollider)`
2. **`InputManager.destroy()`** — 防止场景切换内存泄漏

### P1 — 短期（可维护性）
3. **`Character` 移除内部移动逻辑** — 单一职责，消除 API 二义性
4. **`getComponent` 改用构造函数引用** — 类型安全，消除字符串魔法
5. **`example-05` 天空渲染函数拆分** — `environment/PlainsSky.ts` 等

### P2 — 中期（性能 & 正确性）
6. **Fixed Timestep（semi-fixed accumulator）** — 物理/寻路帧率无关
7. **深度排序空间分区** — O(n²) → O(n log n) 以上优化，大场景必须
8. **SceneManager 集成 assetLoader.clear()** — 场景卸载资源自动回收
9. **ShadowCaster 投影结果缓存** — 减少每帧 project() 调用

### P3 — 长期（特性扩展）
10. **System 层 API** — `scene.addSystem()`，批量组件处理
11. **ObjectPool 集成粒子系统** — 消除每帧 GC
12. **Web Audio PannerNode** — 真正的 3D 空间音频
13. **WebGL 渲染后端**（可选） — 性能天花板突破

---

## 六、与先进框架的综合评分（对比上一版）

| 维度 | Excalibur.js | Phaser 3 | LuxIso v1 | LuxIso v2（当前） |
|------|:---:|:---:|:---:|:---:|
| ECS 设计 | 8/10 | 6/10 | 4/10 | 5/10 |
| 渲染管线 | 7/10 | 9/10 | 7/10 | 7/10 |
| 物理/碰撞 | 7/10 | 8/10 | 6/10 | 7/10 |
| 寻路 | 5/10 | 4/10 | 8/10 | 9/10 |
| 场景管理 | 9/10 | 8/10 | 7/10 | 7/10 |
| 资源管理 | 8/10 | 9/10 | 4/10 | 7/10 |
| 音频 | 7/10 | 8/10 | 7/10 | 7/10 |
| 性能（每帧 GC） | 8/10 | 7/10 | 4/10 | 8/10 |
| 工具链（编辑器） | 5/10 | 7/10 | 8/10 | 8/10 |
| 类型安全 | 9/10 | 6/10 | 7/10 | 8/10 |
| **综合** | **7.3** | **7.2** | **6.2** | **7.3** |

LuxIso v2 已追平 Excalibur.js / Phaser 3 的综合水平。等距渲染、寻路、编辑器工具链方面有明显领先；ECS System 层、固定时间步、深度排序空间分区是拉开与顶级框架差距的核心短板。
