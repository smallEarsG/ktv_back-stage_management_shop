# KTV Merchant Backend API Documentation

> Version: 1.0.0
> Base URL: `/api`

## 全局说明

### 鉴权 (Authentication)
所有受保护接口必须在 Request Header 中携带 JWT Token：
```
Authorization: Bearer <token>
```

### 多门店支持 (Multi-Store Support)
系统支持多门店管理。所有业务接口**必须**在 Request Header 中携带 `X-Store-ID` 以指定当前操作的门店上下文。
*   Header 方式 (推荐): `X-Store-ID: 1001`
*   Query/Body 方式: 均不再使用，统一由后端从 Header 解析

### 参数命名规范
*   所有请求参数（Query/Body）统一使用**驼峰命名法** (camelCase)，例如 `storeId`, `dateRange`, `categoryId`。
*   响应数据中的字段也建议遵循驼峰命名。

### 响应结构 (Response Structure)
成功响应：
```json
{
  "code": 200,
  "message": "success",
  "data": { ... }
}
```
失败响应：
```json
{
  "code": 400, // 或 401, 403, 500 等
  "message": "错误描述信息",
  "data": null
}
```

---


## 2. 仪表盘 (Dashboard)

### 2.1 获取统计数据
*   **URL**: `/dashboard/stats`
*   **Method**: `GET`
*   **Params**:
    *   `dateRange` (Optional): 时间范围 (today, week, month)

**Response Data:**
```json
{
  "sales": {
    "amount": 12800.00,
    "trend": "up", // up, down
    "percentage": 12.5
  },
  "orders": {
    "pending": 5,
    "delivering": 3,
    "completed": 120
  },
  "refunds": {
    "count": 1,
    "amount": 50.00
  }
}
```

### 2.2 获取销售趋势
*   **URL**: `/dashboard/sales-trend`
*   **Method**: `GET`
*   **Params**:
    *   `startDate` (Required): `YYYY-MM-DD`
    *   `endDate` (Required): `YYYY-MM-DD`

**Response Data:**
```json
{
  "xAxis": ["10:00", "11:00", "12:00", "13:00"],
  "series": [120, 300, 450, 200] // 对应时间点的销售额
}
```

---

## 3. 房间管理 (Rooms)

### 3.1 获取房间列表
*   **URL**: `/rooms`
*   **Method**: `GET`
*   **Params**:
    *   `type` (Optional): 筛选房间类型 (小包/中包/大包)

**Response Data:**
```json
{
  "list": [
    {
      "id": 101,
      "roomNumber": "A01",
      "type": "小包",
      "capacity": 4,
      "qrCodeUrl": "https://..."
    }
  ]
}
```

### 3.2 新增房间
*   **URL**: `/rooms`
*   **Method**: `POST`
*   **Description**: 在指定门店下创建新房间。

**Request Body:**
```json
{
  "roomNumber": "V01",
  "type": "大包",
  "capacity": 10
}
```

---

## 4. 商品管理 (Products)

### 4.1 获取分类列表
*   **URL**: `/categories`
*   **Method**: `GET`
*   **Params**: 无 (storeId 通过 Header 传递)

**Response Data:**
```json
{
  "list": [
    { "id": 1, "name": "酒水饮料", "sort": 0 },
    { "id": 2, "name": "小食零食", "sort": 1 }
  ]
}
```

### 4.2 获取商品列表
*   **URL**: `/products`
*   **Method**: `GET`
*   **Params**:
    *   `categoryId` (Optional)
    *   `keyword` (Optional)
    *   `page`: 1
    *   `pageSize`: 20

**Response Data:**
```json
{
  "total": 100,
  "list": [
    {
      "id": 201,
      "name": "百威啤酒",
      "categoryId": 1,
      "price": 15.00,
      "stock": 120,
      "status": true, // 上架状态
      "image": "..."
    }
  ]
}
```

### 4.3 新增商品
*   **URL**: `/products`
*   **Method**: `POST`

**Request Body:**
```json
{
  "categoryId": 1,
  "name": "青岛啤酒",
  "price": 12.00,
  "stock": 200,
  "lowStockThreshold": 20,
  "image": "..."
}
```

### 4.4 调整库存
*   **URL**: `/products/{id}/stock`
*   **Method**: `PATCH`

**Request Body:**
```json
{
  "type": "add", // add (入库), set (盘点设置), reduce (损耗)
  "quantity": 50,
  "reason": "进货入库"
}
```

---

## 5. 订单管理 (Orders)

### 5.1 获取订单列表
*   **URL**: `/orders`
*   **Method**: `GET`
*   **Params**:
    *   `status` (Optional): pending, delivering, completed, refunded
    *   `page`: 1

**Response Data:**
```json
{
  "total": 50,
  "list": [
    {
      "id": "ORD20231027001",
      "orderNumber": "20231027001",
      "roomName": "A01",
      "amount": 128.00,
      "status": "pending",
      "createdAt": "2023-10-27 10:30:00",
      "itemsSummary": "啤酒 x 6, 花生 x 1"
    }
  ]
}
```

### 5.2 更新订单状态
*   **URL**: `/orders/{id}/status`
*   **Method**: `PATCH`

**Request Body:**
```json
{
  "status": "delivering" // pending -> delivering -> completed
}
```

---

### 5.3 收银与工作台同步

以下接口使用当前门店上下文，读取需要订单、工作台或收银权限；收款和核价需要收银权限。

| 接口 | 参数 | 返回内容 |
| --- | --- | --- |
| `GET /orders/operations-summary` | 无 | `pendingOrderIds`：门店全部待处理订单 ID；`roomBalances`：按房间汇总的 `unsettledCount`、`unsettledAmount`、`pendingPaymentCount`，不受列表标签、分页或筛选影响 |
| `GET /orders/by-client-no` | `clientOrderNo` | 当前员工在当前门店创建的原收银订单详情；未找到时 `data` 为 `null` |
| `GET /orders/room-unsettled` | `roomId` | 本房间全部可现金结算的挂账订单快照 `orders` 和总额 `amountTotal` |
| `POST /cashier/quote` | `storeId`、`roomId`、`items` | 按服务端价格核算的 `amountTotal`；只核价，不开单或扣库存 |

现金开单 `POST /cashier/orders` 可附带 `expectedAmount` 和 `cashReceived`。价格与确认金额不一致、现金不足或精度超过两位小数时拒绝创建，重新核价后再确认。

房间结算 `POST /cashier/rooms/{roomId}/settle` 传入 `payMethod: 2`、本次已核对的 `orderIds`、`expectedAmount`、`cashReceived`。后端锁定并核对这些订单，只结算所列订单，新增挂账保持未结；返回 `settledCount`、`amountTotal`、`cashReceived`、`changeAmount`。快照发生变化时需要刷新账款再确认。

未确认提交在浏览器按门店和员工保存原请求。刷新后先查 `by-client-no`；重试必须使用保存的原请求和原 `clientOrderNo`。业务明确拒绝返回 400/409；网络故障或 5xx 不能视为订单未创建。

## 6. 退款/售后 (Refunds)

### 6.1 申请退款
*   **URL**: `/refunds`
*   **Method**: `POST`

**Request Body:**
```json
{
  "orderId": "ORD20231027001",
  "amount": 50.00,
  "reason": "上菜太慢",
  "type": "amount" // amount (仅退款), items (退货退款)
}
```

### 6.2 审核退款
*   **URL**: `/refunds/{id}/audit`
*   **Method**: `POST`

**Request Body:**
```json
{
  "action": "approve", // approve (通过), reject (拒绝)
  "rejectReason": "..." // 拒绝时必填
}
```

---

## 7. 仓库管理 (Warehouse)

### 7.1 获取库存记录
*   **URL**: `/warehouse/history`
*   **Method**: `GET`
*   **Params**:
    *   `productId` (Optional)
    *   `type` (Optional): inbound, outbound, stocktake

**Response Data:**
```json
{
  "list": [
    {
      "id": 1,
      "productName": "百威啤酒",
      "type": "inbound",
      "quantity": 50,
      "currentStock": 170,
      "operator": "张三",
      "time": "2023-10-27 09:00:00"
    }
  ]
}
```

---

## 8. 门店配置 (Configs)

### 8.1 获取配置
*   **URL**: `/store/config`
*   **Method**: `GET`
*   **Params**: 无 (storeId 通过 Header 传递)

**Response Data:**
```json
{
  "storeName": "KTV旗舰店",
  "storePhone": "010-12345678",
  "printSettings": { ... }
}
```

### 8.2 更新配置
*   **URL**: `/store/config`
*   **Method**: `PUT`

**Request Body:**
```json
{
  "configKey": "store_phone",
  "value": "010-87654321"
}
```
### 图片上传
- URL : /common/upload
- Method : POST
- Content-Type : multipart/form-data
## 2. Request Parameters
Parameter Name Type Required Description file File Yes The image file to be uploaded

## 3. Response Structure
The response is returned in JSON format.

### Success Response Example
```
{
  "code": 200,
  "message": "操作成功",
  "data": {
    "url": "https://your-bucket.oss-region.
    aliyuncs.com/path/to/image.jpg",
    "fileName": "image.jpg"
  }
}
```
### Error Response Example
```
{
  "code": 500,
  "message": "上传文件不能为空", // or "文件上
  传失败: error message"
  "data": null
}
```
### Response Parameter Description
Parameter Type Description code Integer Status code (200 indicates success, 500 indicates failure) message String Response message or error description data Object Response data payload url String The URL of the uploaded image fileName String The original name of the uploaded file

## 9. 财务管理 (Finance)

页面入口：`/finance/overview`（财务看板）、`/finance/flows`（资金流水）；旧入口 `/finance` 跳转到财务看板。接口统一需要 `finance:view` 权限，并按当前门店隔离数据。

除未结挂账和流水详情外，以下接口支持 `period`（默认 `today`，可选 `week`、`month`、`year`、`yesterday`、`custom`）、`startTime`、`endTime`。显式时间范围优先，起点包含、终点不包含；时间格式为 `YYYY-MM-DD HH:mm:ss`。`custom` 必须提供起止时间。

| GET 接口 | 返回的 data |
| --- | --- |
| `/finance/summary` | `income`、`refund`、`net` 三项金额与比较结果，以及 `comparison.startTime/endTime` 对比时段 |
| `/finance/trend` | `xAxis` 与收款、退款、净收款三组 `series`；短时段按小时、长时段按日统计，缺少记录的时间段补 0 |
| `/finance/payment-methods` | `list`，每项包含 `payMethod`、`count`、`amount`，按收款金额统计 |
| `/finance/receivables` | `count`、`amount`，当前门店全部未结挂账，不受日期筛选影响 |
| `/finance/flows` | `total`、`list`，支持下述筛选和分页参数 |
| `/finance/flows/{type}/{id}` | `flow` 与关联 `order`（含商品明细），仅能查看本门店流水关联的订单 |
| `/finance/flows/export` | CSV 文件，使用与流水列表相同的筛选，包含全部页；超过 10,000 条时需缩小范围 |

统计口径：收款按已支付订单的支付时间统计；退款只包含已完成退款，按完成时间统计；净收款等于收款减退款，可以为负数。每项汇总包含 `amount`、`trend`、`percentage`、`comparable`；上一周期基数小于等于 0 时，`comparable=false`、`percentage=null`，不展示增长率。

流水列表与导出筛选：`type` 为 `income`（收款）或 `refund`（退款），为空时包含两者；`payMethod` 为 `1`（扫码）、`2`（现金）、`3`（挂账）、`0`（其他）；`keyword` 匹配订单号或退款单号。列表额外支持 `page`（默认 1）、`pageSize`（默认 20，最多 200）；导出不受分页影响。

流水字段包含 `id`、`flowId`、`type`、`businessNo`、`orderId`、`orderNo`、`time`、`roomId`、`payMethod`、`amount`、`refundChannel`、`reason`。`flowId` 使用 `income-{id}` 或 `refund-{id}` 避免订单和退款 ID 重复；JSON 中退款金额为正值，页面和 CSV 使用负号表示资金流出。
