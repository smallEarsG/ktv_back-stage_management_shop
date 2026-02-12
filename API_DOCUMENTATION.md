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