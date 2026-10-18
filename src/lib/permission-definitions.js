// Mirrored from backend permission-catalog-v2.json; keep definitions identical.
export const permissionCatalog = [
  {
    "business": "DINING",
    "action": "dashboard:view",
    "label": "查看经营数据",
    "group": "报表与财务",
    "legacy": [
      "dashboard:view"
    ],
    "dependsOn": [],
    "sensitive": false
  },
  {
    "business": "DINING",
    "action": "order:view",
    "label": "查看订单",
    "group": "订单与营业",
    "legacy": [
      "order:view"
    ],
    "dependsOn": [],
    "sensitive": false
  },
  {
    "business": "DINING",
    "action": "product:view",
    "label": "查看商品",
    "group": "商品与库存",
    "legacy": [
      "product:view"
    ],
    "dependsOn": [],
    "sensitive": false
  },
  {
    "business": "DINING",
    "action": "product:create",
    "label": "新增商品",
    "group": "商品与库存",
    "legacy": [
      "product:view"
    ],
    "dependsOn": [
      "product:view"
    ],
    "sensitive": false
  },
  {
    "business": "DINING",
    "action": "product:edit",
    "label": "编辑商品与上下架",
    "group": "商品与库存",
    "legacy": [
      "product:view"
    ],
    "dependsOn": [
      "product:view"
    ],
    "sensitive": false
  },
  {
    "business": "DINING",
    "action": "warehouse:view",
    "label": "查看库存",
    "group": "商品与库存",
    "legacy": [
      "warehouse:view"
    ],
    "dependsOn": [],
    "sensitive": false
  },
  {
    "business": "DINING",
    "action": "warehouse:adjust",
    "label": "入库、出库与盘点",
    "group": "商品与库存",
    "legacy": [
      "warehouse:view"
    ],
    "dependsOn": [
      "warehouse:view"
    ],
    "sensitive": true
  },
  {
    "business": "DINING",
    "action": "operations:view",
    "label": "查看会员与营销",
    "group": "会员与营销",
    "legacy": [
      "operations:view"
    ],
    "dependsOn": [],
    "sensitive": false
  },
  {
    "business": "DINING",
    "action": "operations:edit",
    "label": "编辑会员规则",
    "group": "会员与营销",
    "legacy": [],
    "dependsOn": [
      "operations:view"
    ],
    "sensitive": false
  },
  {
    "business": "DINING",
    "action": "coupon:manage",
    "label": "管理优惠券与活动",
    "group": "会员与营销",
    "legacy": [],
    "dependsOn": [
      "operations:view"
    ],
    "sensitive": true
  },
  {
    "business": "DINING",
    "action": "refund:view",
    "label": "查看售后与退款",
    "group": "订单与营业",
    "legacy": [
      "refund:view",
      "refund:approve"
    ],
    "dependsOn": [],
    "sensitive": false
  },
  {
    "business": "DINING",
    "action": "refund:approve",
    "label": "审批及执行退款",
    "group": "订单与营业",
    "legacy": [
      "refund:approve"
    ],
    "dependsOn": [
      "refund:view"
    ],
    "sensitive": true
  },
  {
    "business": "DINING",
    "action": "finance:view",
    "label": "查看财务与资金明细",
    "group": "报表与财务",
    "legacy": [
      "finance:view"
    ],
    "dependsOn": [],
    "sensitive": false
  },
  {
    "business": "DINING",
    "action": "finance:export",
    "label": "受控导出订单与财务",
    "group": "报表与财务",
    "legacy": [
      "finance:view"
    ],
    "dependsOn": [
      "finance:view"
    ],
    "sensitive": true
  },
  {
    "business": "DINING",
    "action": "settings:view",
    "label": "查看业务设置",
    "group": "业务设置",
    "legacy": [
      "settings:view"
    ],
    "dependsOn": [],
    "sensitive": false
  },
  {
    "business": "DINING",
    "action": "settings:edit",
    "label": "修改业务设置",
    "group": "业务设置",
    "legacy": [
      "settings:edit"
    ],
    "dependsOn": [
      "settings:view"
    ],
    "sensitive": true
  },
  {
    "business": "MALL",
    "action": "dashboard:view",
    "label": "查看经营数据",
    "group": "报表与财务",
    "legacy": [
      "dashboard:view"
    ],
    "dependsOn": [],
    "sensitive": false
  },
  {
    "business": "MALL",
    "action": "order:view",
    "label": "查看订单",
    "group": "订单与营业",
    "legacy": [
      "order:view"
    ],
    "dependsOn": [],
    "sensitive": false
  },
  {
    "business": "MALL",
    "action": "product:view",
    "label": "查看商品",
    "group": "商品与库存",
    "legacy": [
      "product:view"
    ],
    "dependsOn": [],
    "sensitive": false
  },
  {
    "business": "MALL",
    "action": "product:create",
    "label": "新增商品",
    "group": "商品与库存",
    "legacy": [
      "product:view"
    ],
    "dependsOn": [
      "product:view"
    ],
    "sensitive": false
  },
  {
    "business": "MALL",
    "action": "product:edit",
    "label": "编辑商品与上下架",
    "group": "商品与库存",
    "legacy": [
      "product:view"
    ],
    "dependsOn": [
      "product:view"
    ],
    "sensitive": false
  },
  {
    "business": "MALL",
    "action": "warehouse:view",
    "label": "查看库存",
    "group": "商品与库存",
    "legacy": [
      "warehouse:view"
    ],
    "dependsOn": [
      "product:view"
    ],
    "sensitive": false
  },
  {
    "business": "MALL",
    "action": "warehouse:adjust",
    "label": "入库、出库与盘点",
    "group": "商品与库存",
    "legacy": [
      "warehouse:view"
    ],
    "dependsOn": [
      "warehouse:view"
    ],
    "sensitive": true
  },
  {
    "business": "MALL",
    "action": "operations:view",
    "label": "查看会员与营销",
    "group": "会员与营销",
    "legacy": [
      "operations:view"
    ],
    "dependsOn": [],
    "sensitive": false
  },
  {
    "business": "MALL",
    "action": "operations:edit",
    "label": "编辑会员规则",
    "group": "会员与营销",
    "legacy": [
      "settings:edit"
    ],
    "dependsOn": [
      "operations:view"
    ],
    "sensitive": false
  },
  {
    "business": "MALL",
    "action": "coupon:manage",
    "label": "管理优惠券与活动",
    "group": "会员与营销",
    "legacy": [
      "operations:view"
    ],
    "dependsOn": [
      "operations:view"
    ],
    "sensitive": true
  },
  {
    "business": "MALL",
    "action": "refund:view",
    "label": "查看售后与退款",
    "group": "订单与营业",
    "legacy": [
      "refund:view",
      "refund:approve"
    ],
    "dependsOn": [],
    "sensitive": false
  },
  {
    "business": "MALL",
    "action": "refund:approve",
    "label": "审批及执行退款",
    "group": "订单与营业",
    "legacy": [
      "refund:approve"
    ],
    "dependsOn": [
      "refund:view"
    ],
    "sensitive": true
  },
  {
    "business": "MALL",
    "action": "finance:view",
    "label": "查看财务与资金明细",
    "group": "报表与财务",
    "legacy": [
      "finance:view"
    ],
    "dependsOn": [],
    "sensitive": false
  },
  {
    "business": "MALL",
    "action": "finance:export",
    "label": "受控导出订单与财务",
    "group": "报表与财务",
    "legacy": [
      "finance:view"
    ],
    "dependsOn": [
      "finance:view"
    ],
    "sensitive": true
  },
  {
    "business": "MALL",
    "action": "settings:view",
    "label": "查看业务设置",
    "group": "业务设置",
    "legacy": [
      "settings:view"
    ],
    "dependsOn": [],
    "sensitive": false
  },
  {
    "business": "MALL",
    "action": "settings:edit",
    "label": "修改业务设置",
    "group": "业务设置",
    "legacy": [
      "settings:edit"
    ],
    "dependsOn": [
      "settings:view"
    ],
    "sensitive": true
  },
  {
    "business": "DINING",
    "action": "pos:view",
    "label": "收银开单与结账",
    "group": "订单与营业",
    "legacy": [
      "pos:view"
    ],
    "dependsOn": [],
    "sensitive": false
  },
  {
    "business": "DINING",
    "action": "dining:view",
    "label": "查看台位营业",
    "group": "订单与营业",
    "legacy": [
      "dining:view"
    ],
    "dependsOn": [],
    "sensitive": false
  },
  {
    "business": "DINING",
    "action": "dining:manage",
    "label": "开台、转台与清台",
    "group": "订单与营业",
    "legacy": [
      "dining:manage"
    ],
    "dependsOn": [
      "dining:view"
    ],
    "sensitive": false
  },
  {
    "business": "DINING",
    "action": "workbench:view",
    "label": "查看订单工作台",
    "group": "订单与营业",
    "legacy": [
      "workbench:view"
    ],
    "dependsOn": [
      "order:view"
    ],
    "sensitive": false
  },
  {
    "business": "DINING",
    "action": "order:edit",
    "label": "接单及处理订单状态",
    "group": "订单与营业",
    "legacy": [
      "order:view",
      "workbench:view"
    ],
    "dependsOn": [
      "order:view"
    ],
    "sensitive": false
  },
  {
    "business": "DINING",
    "action": "kitchen:operate",
    "label": "后厨制作与出餐",
    "group": "订单与营业",
    "legacy": [
      "kitchen:operate"
    ],
    "dependsOn": [],
    "sensitive": false
  },
  {
    "business": "DINING",
    "action": "service:operate",
    "label": "处理顾客服务请求",
    "group": "订单与营业",
    "legacy": [
      "service:operate"
    ],
    "dependsOn": [],
    "sensitive": false
  },
  {
    "business": "DINING",
    "action": "product:delete",
    "label": "删除商品与分类",
    "group": "商品与库存",
    "legacy": [
      "product:view"
    ],
    "dependsOn": [
      "product:view"
    ],
    "sensitive": true
  },
  {
    "business": "MALL",
    "action": "order:ship",
    "label": "登记发货与物流",
    "group": "订单与营业",
    "legacy": [
      "order:view"
    ],
    "dependsOn": [
      "order:view"
    ],
    "sensitive": false
  },
  {
    "business": "MALL",
    "action": "order:pickup",
    "label": "核验自提码",
    "group": "订单与营业",
    "legacy": [
      "order:view"
    ],
    "dependsOn": [
      "order:view"
    ],
    "sensitive": false
  },
  {
    "business": "MALL",
    "action": "wallet:topup",
    "label": "增加商城模拟余额",
    "group": "会员与营销",
    "legacy": [
      "finance:view"
    ],
    "dependsOn": [
      "operations:view",
      "finance:view"
    ],
    "sensitive": true
  },
  {
    "business": "MALL",
    "action": "sharing:manage",
    "label": "配置跨业务商品与库存共享",
    "group": "业务设置",
    "legacy": [
      "settings:edit"
    ],
    "dependsOn": [
      "settings:view"
    ],
    "sensitive": true,
    "requiresBusinesses": [
      "DINING",
      "MALL"
    ]
  },
  {
    "business": "MALL",
    "action": "sharing:copy",
    "label": "复制点餐商品到商城",
    "group": "商品与库存",
    "legacy": [
      "product:view"
    ],
    "dependsOn": [
      "product:view",
      "DINING:product:view"
    ],
    "sensitive": false,
    "requiresBusinesses": [
      "DINING",
      "MALL"
    ]
  },
  {
    "business": "MALL",
    "action": "sharing:bind",
    "label": "绑定与解除共享库存",
    "group": "商品与库存",
    "legacy": [
      "warehouse:view"
    ],
    "dependsOn": [
      "warehouse:view",
      "DINING:warehouse:view"
    ],
    "sensitive": true,
    "requiresBusinesses": [
      "DINING",
      "MALL"
    ]
  },
  {
    "business": "COMMON",
    "action": "settings:view",
    "label": "查看门店与员工信息",
    "group": "公共管理",
    "legacy": [
      "settings:view"
    ],
    "dependsOn": [],
    "sensitive": false
  }
]
