# FluxIso 项目长期记忆

## 框架约定

### IsoObject.update() 签名规范
所有 IsoObject 子类的 `update()` 方法必须使用时间戳签名：
```ts
update(ts?: number): void
```
参数是 `performance.now()` 返回的毫秒时间戳，**不是** delta time（秒）。
内部通过保存 `_lastTs` 自行计算 dt。

### ParticleSystem（src/animation/ParticleSystem.ts）
- `update(ts?)` — 已修正为时间戳接口（2026-04-06）
- `EmitterConfig` 支持 `spawnRadius`（= `radius` 的别名）
- `maxParticles`/`max` 上限检查已实现
- 待完善：`particleShape`、`alphaStart/End`、`sizeFinal`、`blend` 模式暂未在 draw() 中实现

## 项目结构要点
- `src/` — 引擎核心（74 个 .ts）
- `examples/` — 示例场景（08-volcano 等）
- 等轴测投影：`src/math/IsoProjection.ts`，`project(x,y,z,tileW,tileH)` 返回 `{sx,sy}`
- 深度排序：`src/math/depthSort.ts`，拓扑排序（Kahn 算法 + 空间 Hash 优化）

## Scene 渲染层级顺序（2026-04-06 修复后）
1. **Floor**（`instanceof Floor`）→ offscreen lightmap blit
2. **Ground layer**（`isGroundLayer = true`）→ 按 addObject 顺序绘制，不参与 topoSort
   - 适用于：覆盖整个地图的大范围地形，如 `RockLayer`、`LavaRiver`、自定义地形
3. **topoSort 对象** → Kahn 拓扑排序后绘制（Wall、Character、Crystal 等）

### IsoObject.isGroundLayer 约定
- 默认 `false`
- 覆盖整个地图 XY（或大范围平面地形）的对象必须设为 `true`
- 原因：大范围对象的 AABB 包含所有其他对象的 XY，会导致 topoSort 图构建出错

### AABB Z 单位约定
- AABB `baseZ`/`maxZ` 单位：**tileH/2 像素**（默认 tileH=32 → 1 AABB-Z = 16px）
- `project()` 的 z 参数：**像素**直接偏移（`sy = (x+y)*(tileH/2) - z`）
- Wall：`maxZ = wallHeight / (tileH/2)`
- Character：`maxZ = position.z + Math.max(1, radius/8)`（radius=22 → maxZ≈2.75）

## depthSort.ts：spatial hash bucket 孤立问题（2026-04-06 新增修复）

**`BUCKET_SIZE=2`** 的空间哈希让 topoSort 只比较共享 bucket 的对象。
不同 bucket 的对象（如 player@(2,2) 和 w1@(4,4)）即使应按等轴测深度排序，
Kahn 图中也会没有边 → 输出顺序 = 插入顺序 → 错误。

**修复**：Orphan-fix pass + Kahn 优先队列（center-depth 排序）。

---

## depthSort.ts：isBehind() 混合轴规则（2026-04-06 最终版）

完整判断树：
```
overlapX && overlapY?
  └─ overlapZ?
       └─ bContainsA && aContainsB  → centerA < centerB  (same footprint)
       └─ bContainsA || aContainsB  → centerA < centerB  (含包含关系时用 center，
                                       避免 thin-wall padding 导致 far-corner 错误)
       └─ partial overlap (互不包含) → far-corner:
            aFarX && aFarY          → true
            !aFarX && !aFarY        → false
            MIXED                   → (a.maxX+a.maxY) <= (b.maxX+b.maxY)
no XY overlap → centerA <= centerB
```

关键规则：**任何 containment（含同 footprint）都用 center depth**，
不能用 far corner——thin wall 的 Y padding 仅 0.2，角色跨越后 aContainsB=true，
但 far corner 会因 maxY 超过 wall 而给出错误结论。
