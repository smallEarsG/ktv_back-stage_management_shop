# 订单工作台（仅履约四步）计划

## Summary
新增一个独立“工作台”页面，用卡片流承载订单履约的 4 个动作：接单 → 备货 → 送货 → 完成。工作台不承担历史查询、复杂报表、退款统计、长时间范围筛选，这些继续留在“订单管理页”。

工作台采用“三层结构”：
- 顶部：状态 Tab + 实时统计 + 刷新/声音提醒/房间筛选/搜索
- 中间：订单任务卡片流（按状态分组）
- 右侧抽屉：订单详情/履约详情（含明细与履约动作）

## Current State Analysis
### 前端现状
- 已有订单管理页：[OrderList.vue](file:///c:/Users/Administrator/Desktop/project/ktv/ktv_back-stage_management_shop/src/views/orders/OrderList.vue)
  - 当前是表格视图，包含多状态筛选/等待时长/详情弹窗等。
  - 已接入订单详情 `GET /api/orders/{id}`（前端写作 `GET /orders/{id}`）。
- 路由与菜单结构：
  - 路由集中在 [router/index.js](file:///c:/Users/Administrator/Desktop/project/ktv/ktv_back-stage_management_shop/src/router/index.js)
  - 菜单集中在 [AppLayout.vue](file:///c:/Users/Administrator/Desktop/project/ktv/ktv_back-stage_management_shop/src/layouts/AppLayout.vue)
  - 权限是前端 Pinia mock（默认给演示账号写死 permissions）：[user.js](file:///c:/Users/Administrator/Desktop/project/ktv/ktv_back-stage_management_shop/src/stores/user.js)
- 现有 API 文档里 `/orders/{id}/status` 仍是旧的字符串状态流转（pending→delivering→completed）：[API_DOCUMENTATION.md](file:///c:/Users/Administrator/Desktop/project/ktv/ktv_back-stage_management_shop/API_DOCUMENTATION.md#L203-L240)
  - 但本次需求以“数字状态码 + 四段履约流转”为准：20→30→40→50。

### 需求决策（来自用户确认）
- 需要独立“配送中”阶段（四段流转）：待处理(20) → 备货中(30) → 配送中(40) → 已完成(50)
- 工作台不提供“取消订单”（只做 4 件事）
- 工作台入口独立菜单 + 独立权限（workbench:view）
- 详情采用右侧抽屉（不打断工作流）

## Proposed Changes
### 1) 新增“工作台”路由与菜单入口
**文件**
- [router/index.js](file:///c:/Users/Administrator/Desktop/project/ktv/ktv_back-stage_management_shop/src/router/index.js)
- [AppLayout.vue](file:///c:/Users/Administrator/Desktop/project/ktv/ktv_back-stage_management_shop/src/layouts/AppLayout.vue)
- [user.js](file:///c:/Users/Administrator/Desktop/project/ktv/ktv_back-stage_management_shop/src/stores/user.js)

**改动**
- 新增路由：`/workbench`（或 `/workbench/orders`，本计划采用 `/workbench`）
  - meta: `{ title: '工作台', requiresAuth: true, permission: 'workbench:view' }`
- 侧边栏新增菜单项“工作台”（建议放在“订单管理”上方）
- user store 的 mock 默认权限列表补上 `workbench:view`，以免演示环境菜单不显示

### 2) 新增工作台页面（卡片流 + 顶部统计 + 详情抽屉）
**文件**
- 新增：[src/views/workbench/OrderWorkbench.vue](file:///c:/Users/Administrator/Desktop/project/ktv/ktv_back-stage_management_shop/src/views/workbench/OrderWorkbench.vue)

**页面结构**
1) 顶部（干活导向）
- Tab：`待处理`、`备货中`、`配送中`、`已完成`
  - 每个 Tab 显示数量徽标（如“待处理 3”）
- 操作区：
  - 刷新按钮（手动拉取最新任务）
  - 声音提醒开关（默认关闭；开启后对“新出现的待处理订单”提示）
  - 房间筛选（下拉/可输入）
  - 搜索框（房间号/订单号）
- 统计卡片（4 个小卡片）：
  - 待处理数量（20）
  - 备货中数量（30）
  - 配送中数量（40）
  - 超时订单数量（创建时间到当前 ≥ 20 分钟，且状态在 20/30/40）

2) 中间（订单任务卡片流）
- 不使用大表格，改为卡片网格（响应式 1~3 列）
- 每张卡片包含：
  - 房间号、订单号、下单时间、等待时长（仅 20/30/40 显示）
  - 商品摘要：最多显示前 3 条，更多显示“+N件商品”
    - 优先使用列表字段 `itemsSummary` 做预览
  - 备注：若列表/详情存在备注字段（如 remark/note/comment），展示一行（否则不显示）
  - 状态 tag（中文）
  - 操作按钮（按状态）
    - 20：`接单`（→30）、`详情`
    - 30：`标记已备齐`（→40）、`详情`
    - 40：`完成`（→50）、`详情`
    - 50：`详情`（可只显示最近 N 单，避免干扰）

3) 右侧抽屉（订单详情/履约详情）
- `el-drawer` 右侧展开，展示：
  - 订单主信息：orderNo/roomId/userId/status/payStatus/amountTotal/amountPaid/amountRefunded/currency
  - 时间信息：createdAt/paidAt/canceledAt/completedAt
  - 明细 items：skuCode、skuSpecs、selectedAttrs（对象转可读文本）、单价/数量/小计
- 抽屉底部提供与卡片一致的履约动作按钮（避免必须回到卡片操作）

### 3) 数据拉取与状态流转（仅履约四步）
**列表接口（任务流）**
- 主数据来源：`GET /api/orders`
  - 参数：`page=1&pageSize=...`
  - 优先尝试传 `status=20/30/40/50` 做服务端过滤（如果后端支持）
  - 若后端不支持数字 status，则退化为“拉取大页列表后前端过滤”（与现有订单管理页一致）

**详情接口**
- `GET /api/orders/{id}`：抽屉打开时拉取，支持刷新（复用现有详情渲染逻辑）

**状态更新接口**
- `PATCH /api/orders/{id}/status`：请求体 `{ status: <nextStatusCode> }`
  - 20 → 30（接单）
  - 30 → 40（标记已备齐/开始配送）
  - 40 → 50（完成）
- 成功后：局部刷新当前 Tab 列表与顶部统计；保持用户当前 Tab/筛选不变

**排序**
- 每个 Tab 内默认按 `createdAt` 升序（越久越靠前，方便先处理最久的）

**声音提醒**
- 仅对“新出现的待处理（20）订单”提醒
- 实现方式：WebAudio 生成短促 beep（不依赖静态音频文件）
- 轮询：当声音开关开启时，每 10 秒自动刷新一次待处理列表（并仅在发现新订单时响）

## Assumptions & Decisions
- 工作台只负责履约四步，不提供取消/退款/历史范围筛选等功能。
- 工作台的房间筛选优先通过 `GET /api/rooms` 获取房间列表（可用 API 文档中的 rooms 接口），若不可用则退化为仅搜索框筛选。
- 订单列表接口存在 `itemsSummary/createdAt/status/roomName(or roomId)` 等字段可用于卡片预览；缺失字段用 `—` 兜底展示。

## Verification Steps
### 构建验证
- 前端 `npm run build` 通过

### 手工验收（本地 dev）
- 进入“工作台”菜单，页面能正常渲染，顶部四个 Tab 可切换且有数量统计
- 待处理/备货中/配送中 Tab 内按卡片展示，等待时长正确（取消/完成不显示等待时长）
- 搜索（订单号/房间号）与房间筛选生效
- 打开详情抽屉能正确请求 `GET /orders/{id}` 并渲染 items（含 selectedAttrs 展示）
- 履约动作按钮按状态显示并能调用 `PATCH /orders/{id}/status`：
  - 20→30 后订单从“待处理”移至“备货中”
  - 30→40 后订单从“备货中”移至“配送中”
  - 40→50 后订单从“配送中”移至“已完成”
- 声音提醒开启后：新待处理订单进入列表时会提示；关闭后不提示

