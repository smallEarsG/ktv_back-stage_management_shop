# 前端适配计划：价格/库存/预警迁移到 SKU

## Summary

后端已将商品的 `price/stock/lowStockThreshold` 迁移到 `product_skus`，并且所有商品都保证至少 1 条 SKU。前端管理端需要把“商品页 + 仓库页”的读写逻辑统一改为以 SKU 为唯一库存来源：商品新增/编辑始终提交 `skus[]`；商品列表/详情显示的 `price/stock/lowStockThreshold` 使用接口返回的汇总值；仓库入库/出库/盘点提交时传 `skuId`（多 SKU 必填）。

## Current State Analysis（基于现有代码与后端实现）

### 现有前端实现

- 商品管理页集中在 [ProductList.vue](file:///c:/Users/Administrator/Desktop/project/ktv/ktv_back-stage_management_shop/src/views/products/ProductList.vue)
  - 既支持“单规格（无 SKU）”也支持“多规格（SKU 表）”：通过 `productForm.hasSkus` 控制 UI 与 payload。
  - 保存时直接提交 `productForm`，SKU 行字段目前使用 `stock/deduct/skuCode`，并存在 `shared` 库存语义与相关计算分支。
- 仓库页集中在 [WarehouseList.vue](file:///c:/Users/Administrator/Desktop/project/ktv/ktv_back-stage_management_shop/src/views/warehouse/WarehouseList.vue)
  - SKU 选择项 value 有时取 `skuCode` 有时取 `sku.id`，且提交时会把 `productId` 拼成 `productId_skuId`。

### 后端接口当前行为（已核对代码）

- 商品列表/详情（`GET /api/products`、`GET /api/products/{id}`）：
  - 总是返回 `hasSkus=true`、`stockType=independent`。
  - 返回 `skus` 为 `ProductSkus` 实体序列化结果：包含 `id/skuSpecs/price/stockQuantity/lowStockThreshold/skuCode/...`。
  - 返回的 `price/stock/lowStockThreshold` 为后端基于 `skus` 的汇总值。
  - 若商品无 SKU，会自动补默认 SKU（`skuSpecs="[]"`、价格/库存/阈值有默认值）。
  - 参考 [ProductsServiceImpl.java](file:///c:/Users/Administrator/Desktop/project/ktv/ktv_server/ktv_server/src/main/java/com/ruoyi/ktv/service/impl/ProductsServiceImpl.java#L88-L214)
- 商品新增（`POST /api/products`）：
  - `skus` 不传也可：后端会用 `body.price/body.stock/body.lowStockThreshold` 补默认 SKU。
  - 但 SKU 字段名以 `stockDeductCount/skuCode/lowStockThreshold` 为准。
  - 参考 [ProductsServiceImpl.java](file:///c:/Users/Administrator/Desktop/project/ktv/ktv_server/ktv_server/src/main/java/com/ruoyi/ktv/service/impl/ProductsServiceImpl.java#L216-L318)
- 商品更新（`PUT /api/products/{id}`）：
  - 仅当 body 传 `skus` 才会更新 SKU 的 `price/stock/lowStockThreshold/...`；只传 `price/stock` 不会改到 SKU。
  - 参考 [ProductsServiceImpl.java](file:///c:/Users/Administrator/Desktop/project/ktv/ktv_server/ktv_server/src/main/java/com/ruoyi/ktv/service/impl/ProductsServiceImpl.java#L395-L516)
- 仓库出入库/盘点（`POST /api/warehouse/*`）：
  - body 支持 `productId` + 可选 `skuId`，controller 内部会组合成 `productId_skuId` 再调用 `adjustStock`。
  - 参考 [WarehouseController.java](file:///c:/Users/Administrator/Desktop/project/ktv/ktv_server/ktv_server/src/main/java/com/ruoyi/ktv/controller/WarehouseController.java#L33-L70)

## Decisions（本次前端适配按你刚确认的口径）

- 商品新增/编辑 UI 统一走 SKU 表格：单规格商品表现为“1 行默认 SKU”，不再出现“无 SKU 的单规格表单”。
- 低库存预警阈值按 SKU 维度编辑：SKU 表格增加 `lowStockThreshold` 列。
- 仓库入库/出库/盘点：当商品存在多条 SKU 时，`skuId` 必填（避免误调默认 SKU）。

## Proposed Changes

### 1) 商品页：统一 SKU 模型与字段归一化（ProductList.vue）

修改文件：[ProductList.vue](file:///c:/Users/Administrator/Desktop/project/ktv/ktv_back-stage_management_shop/src/views/products/ProductList.vue)

#### 1.1 数据结构与归一化函数

- 新增一个本地的 SKU 归一化函数（仅在该组件内），把后端返回的 `ProductSkus` 形态统一为前端使用形态：
  - `specs`：兼容 `specs/skuSpecs/sku_specs`，字符串 JSON 自动 parse；若 parse 后是数组（如 `"[]"`），统一转换为 `{}`（避免被当成多规格）。
  - `stock`：兼容 `stock/stockQuantity/stock_quantity`。
  - `deduct`：兼容 `deduct/stockDeductCount/stock_deduct_count`。
  - `skuCode`：兼容 `skuCode/sku_code/code`。
  - `lowStockThreshold`：从 SKU 自身读取，缺省使用 10。
- 商品行归一化：
  - `price/stock/lowStockThreshold` 强制转为 number，避免模板里 `toFixed`/比较时报错。

#### 1.2 新增/编辑：始终提交 `skus[]`，并改为后端字段名

- UI：
  - 保留“规格设置 + 生成组合”的能力，但不再把 `hasSkus=false` 视为“无 SKU”；而是视为“无规格组合，仅 1 个默认 SKU”。
  - 当未启用规格组合时：SKU 表格只渲染 1 行，且不显示规格列（或规格列为空）。
  - 删除/隐藏 `stockType/shared` 的所有 UI 与逻辑分支（后端固定 `independent`）。
- 保存 payload（create/update）：
  - 始终生成 `payload.skus`：
    - 默认 SKU：`specs: []`（与后端默认一致），并携带 `price/stock/lowStockThreshold/skuCode`。
    - 多规格：`specs` 使用对象（例如 `{ 颜色: '红' }`），并携带 `id`（编辑场景）、`price/stock/lowStockThreshold/skuCode/stockDeductCount`。
  - 将前端 SKU 行字段 `deduct` 映射到 `stockDeductCount`（后端识别该字段）。
  - 仍可保留商品级 `price/stock/lowStockThreshold` 字段在 payload 中（非必须），但以 `skus[]` 为准。

#### 1.3 列表/详情展示：使用 SKU 汇总值 + SKU 列表展示

- 列表：
  - 价格列显示使用 `Number(row.price)`，避免 `row.price.toFixed` 在 BigDecimal/string 场景崩溃。
  - 低库存高亮逻辑使用 `Number(row.stock) < Number(row.lowStockThreshold ?? 10)`。
- 详情弹窗：
  - `openProductDetail` 时对 `detailProduct.skus` 做同样归一化，库存列使用统一的 `sku.stock` 字段，预警阈值使用 `sku.lowStockThreshold` 字段。

### 2) 仓库页：统一 skuId 传参与 SKU 选择必填规则（WarehouseList.vue）

修改文件：[WarehouseList.vue](file:///c:/Users/Administrator/Desktop/project/ktv/ktv_back-stage_management_shop/src/views/warehouse/WarehouseList.vue)

- 修正拉取库存列表参数与字段默认值：
  - 将 `/products` 查询参数改为与后端一致：`page/pageSize/keyword`。
  - `min` 与 `status` 计算增加默认值：`min = Number(p.lowStockThreshold ?? 10)`。
- SKU options 统一 value 为 `sku.id`：
  - 从 `/products` 列表行或 `/products/{id}` 明细拿到 `skus` 后，统一 parse `skuSpecs/sku_specs/specs`，并将 `value` 固定为 `sku.id`（避免 skuCode/id 混用）。
  - label：规格值为空时显示“默认 SKU”，否则显示规格组合；可附带 skuCode。
- 提交出入库/盘点 payload：
  - 改为 `{ productId, skuId, quantity, reason }`，不再拼接 `productId_skuId`。
  - 校验规则：当选中商品的 SKU 数量 > 1 时，`skuId` 必填；仅 1 条 SKU 时可不选（等价默认 SKU）。

## Assumptions & Edge Cases

- `GET /products` 返回的 `skus` 为 `ProductSkus` 实体序列化，字段名包含 `skuSpecs/stockQuantity/stockDeductCount/skuCode/lowStockThreshold`；前端以“多字段 fallback + 类型归一化”方式兼容。
- 默认 SKU 的 `skuSpecs="[]"` 需要在前端归一化为 `{}`，否则会被当作“有规格字段”的异常对象处理。
- 若列表接口不返回 `skus`（未来可能优化为不带），商品编辑时需要补一次 `GET /products/{id}` 拉明细；本次先按当前后端实现（列表已包含 `skus`）实现，保留扩展点。

## Verification Steps

- 静态检查：`npm run lint`
- 构建检查：`npm run build`
- 手工联调（管理端）：
  - 新增商品：不配置规格组合时，生成 1 行默认 SKU，保存后列表/详情 `price/stock/lowStockThreshold` 正常显示，且详情 SKU 表存在 1 行。
  - 新增多规格商品：生成组合后能编辑每行 `price/stock/lowStockThreshold/skuCode`，保存后列表价格为最小价、库存为总和、阈值为最小阈值。
  - 编辑商品：修改默认 SKU 的价格/库存/阈值后保存，刷新列表/详情能反映变化（验证“update 必须传 skus”已生效）。
  - 仓库入库：单 SKU 商品允许不选 SKU 直接入库；多 SKU 商品必须选择 SKU 才能提交；入库后库存变化与记录展示正常。

