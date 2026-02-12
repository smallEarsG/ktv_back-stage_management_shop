-- 创建数据库
CREATE DATABASE IF NOT EXISTS ktv_merchant_db DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE ktv_merchant_db;

-- 1. 用户表 (管理员/员工)
CREATE TABLE `users` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `store_id` bigint NOT NULL DEFAULT '0' COMMENT '所属门店ID (0表示平台/单店)',
  `username` varchar(50) NOT NULL COMMENT '用户名',
  `password_hash` varchar(100) NOT NULL COMMENT '加密密码',
  `name` varchar(50) NOT NULL COMMENT '姓名',
  `role` varchar(20) NOT NULL DEFAULT 'staff' COMMENT '角色: admin(店长), staff(员工)',
  `permissions` json DEFAULT NULL COMMENT '权限列表 (JSON数组, e.g. ["order:view", "product:edit"])',
  `phone` varchar(20) DEFAULT NULL COMMENT '手机号',
  `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否启用',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_username` (`username`),
  KEY `idx_store_id` (`store_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户表';

-- 初始管理员账号: admin / 123456 (需自行生成BCrypt加密串，此处仅为示例)
-- INSERT INTO users (username, password_hash, name, role) VALUES ('admin', '$2a$10$XxXxXx...', '管理员', 'admin');

-- 2. 商品分类表
CREATE TABLE `categories` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `name` varchar(50) NOT NULL COMMENT '分类名称',
  `sort_order` int NOT NULL DEFAULT '0' COMMENT '排序权重',
  `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否启用',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='商品分类表';

-- 3. 商品表
CREATE TABLE `products` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `store_id` bigint NOT NULL DEFAULT '0' COMMENT '门店ID',
  `category_id` bigint NOT NULL COMMENT '分类ID',
  `name` varchar(100) NOT NULL COMMENT '商品名称',
  `price` decimal(10,2) NOT NULL DEFAULT '0.00' COMMENT '价格',
  `stock_quantity` int NOT NULL DEFAULT '0' COMMENT '库存数量',
  `low_stock_threshold` int NOT NULL DEFAULT '10' COMMENT '低库存预警阈值',
  `image_url` varchar(255) DEFAULT NULL COMMENT '商品图片URL',
  `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否上架',
  `has_skus` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否开启多规格',
  `stock_type` varchar(20) NOT NULL DEFAULT 'independent' COMMENT '库存模式: independent(独立库存), shared(共享库存)',
  `spec_list` json DEFAULT NULL COMMENT '规格列表定义 (e.g. [{"name":"颜色", "values":["红","蓝"]}])',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_store_id` (`store_id`),
  KEY `idx_category_id` (`category_id`),
  CONSTRAINT `fk_product_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='商品表';

-- 3.1 商品SKU表
CREATE TABLE `product_skus` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `product_id` bigint NOT NULL COMMENT '商品ID',
  `sku_specs` json NOT NULL COMMENT '规格值组合 (e.g. {"颜色":"红", "尺寸":"S"})',
  `price` decimal(10,2) NOT NULL DEFAULT '0.00' COMMENT 'SKU价格',
  `stock_quantity` int NOT NULL DEFAULT '0' COMMENT 'SKU库存 (独立模式下有效)',
  `stock_deduct_count` int NOT NULL DEFAULT '1' COMMENT '库存消耗量 (共享模式下使用)',
  `image_url` varchar(255) DEFAULT NULL COMMENT 'SKU图片',
  `sku_code` varchar(50) DEFAULT NULL COMMENT 'SKU编码',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_product_id` (`product_id`),
  CONSTRAINT `fk_sku_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='商品SKU表';

-- 4. 房间/座位表
CREATE TABLE `rooms` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `store_id` bigint NOT NULL DEFAULT '0' COMMENT '门店ID',
  `room_number` varchar(20) NOT NULL COMMENT '房间号/座位号',
  `room_type` varchar(20) DEFAULT '小包' COMMENT '类型: 小包/中包/大包/散座',
  `capacity` int DEFAULT '4' COMMENT '容纳人数',
  `qr_code` varchar(255) DEFAULT NULL COMMENT '二维码内容/链接',
  `is_available` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否可用',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_room_number` (`store_id`, `room_number`),
  KEY `idx_store_id` (`store_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='房间座位表';

-- 5. 订单表
CREATE TABLE `orders` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `store_id` bigint NOT NULL DEFAULT '0' COMMENT '门店ID',
  `order_number` varchar(32) NOT NULL COMMENT '订单号',
  `room_id` bigint NOT NULL COMMENT '房间ID',
  `user_id` bigint DEFAULT NULL COMMENT '操作员工ID (若是员工代下单若不是则则填入用户id)',
  `total_amount` decimal(10,2) NOT NULL DEFAULT '0.00' COMMENT '订单总金额',
  `refunded_amount` decimal(10,2) NOT NULL DEFAULT '0.00' COMMENT '已退款总金额',
  `payment_status` varchar(20) NOT NULL DEFAULT 'unpaid' COMMENT '支付状态: unpaid(未支付), paid(已支付), partial_refunded(部分退款), full_refunded(全额退款)',
  `fulfillment_status` varchar(20) NOT NULL DEFAULT 'pending' COMMENT '履约状态: pending(待接单), preparing(备货中), delivering(配送中), completed(已完成), cancelled(已取消)',
  `notes` varchar(255) DEFAULT NULL COMMENT '备注',
  `pay_time` datetime DEFAULT NULL COMMENT '支付时间',
  `order_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '下单时间',
  `completed_time` datetime DEFAULT NULL COMMENT '完成时间',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_order_number` (`order_number`),
  KEY `idx_store_id` (`store_id`),
  KEY `idx_room_id` (`room_id`),
  KEY `idx_user_id` (`user_id`),
  CONSTRAINT `fk_order_room` FOREIGN KEY (`room_id`) REFERENCES `rooms` (`id`),
  CONSTRAINT `fk_order_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='订单表';

-- 6. 订单明细表
CREATE TABLE `order_items` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `order_id` bigint NOT NULL COMMENT '订单ID',
  `product_id` bigint NOT NULL COMMENT '商品ID',
  `product_name` varchar(100) NOT NULL COMMENT '商品名称快照',
  `quantity` int NOT NULL DEFAULT '1' COMMENT '下单数量',
  `refunded_quantity` int NOT NULL DEFAULT '0' COMMENT '已退款数量',
  `unit_price` decimal(10,2) NOT NULL COMMENT '单价快照',
  `total_price` decimal(10,2) NOT NULL COMMENT '总价 (单价*数量)',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_order_id` (`order_id`),
  KEY `idx_product_id` (`product_id`),
  CONSTRAINT `fk_order_item_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`),
  CONSTRAINT `fk_order_item_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='订单明细表';

-- 7. 退款记录表 (主表)
CREATE TABLE `refunds` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `store_id` bigint NOT NULL DEFAULT '0' COMMENT '门店ID',
  `refund_no` varchar(32) NOT NULL COMMENT '退款单号 (唯一)',
  `order_id` bigint NOT NULL COMMENT '关联订单ID',
  `refund_amount` decimal(10,2) NOT NULL COMMENT '本次退款金额',
  `refund_type` varchar(20) NOT NULL DEFAULT 'amount' COMMENT '类型: amount(仅退款), items(退货退款)',
  `reason` varchar(255) DEFAULT NULL COMMENT '退款原因',
  `status` varchar(20) NOT NULL DEFAULT 'pending' COMMENT '状态: pending(待审核), processing(退款中), success(成功), failed(失败), rejected(拒绝)',
  `processed_by` bigint DEFAULT NULL COMMENT '处理人ID',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '申请时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_refund_no` (`refund_no`),
  KEY `idx_store_id` (`store_id`),
  KEY `idx_order_id` (`order_id`),
  KEY `idx_processed_by` (`processed_by`),
  CONSTRAINT `fk_refund_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`),
  CONSTRAINT `fk_refund_processor` FOREIGN KEY (`processed_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='退款记录表';

-- 8. 退款明细表 (关联商品)
CREATE TABLE `refund_items` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `refund_id` bigint NOT NULL COMMENT '退款单ID',
  `order_item_id` bigint NOT NULL COMMENT '原订单明细ID',
  `quantity` int NOT NULL COMMENT '本次退款数量',
  `amount` decimal(10,2) NOT NULL COMMENT '本次该项退款金额',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_refund_id` (`refund_id`),
  CONSTRAINT `fk_refund_item_refund` FOREIGN KEY (`refund_id`) REFERENCES `refunds` (`id`),
  CONSTRAINT `fk_refund_item_order_item` FOREIGN KEY (`order_item_id`) REFERENCES `order_items` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='退款明细表';

-- 9. 仓库出入库记录表
CREATE TABLE `warehouse_records` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `store_id` bigint NOT NULL DEFAULT '0' COMMENT '门店ID',
  `product_id` bigint NOT NULL COMMENT '商品ID',
  `user_id` bigint DEFAULT NULL COMMENT '操作人ID',
  `record_type` varchar(20) NOT NULL COMMENT '类型: inbound(入库), outbound(出库), stocktake(盘点)',
  `quantity` int NOT NULL COMMENT '变动数量 (正数)',
  `previous_stock` int NOT NULL COMMENT '变动前库存',
  `current_stock` int NOT NULL COMMENT '变动后库存',
  `notes` varchar(255) DEFAULT NULL COMMENT '备注',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',
  PRIMARY KEY (`id`),
  KEY `idx_store_id` (`store_id`),
  KEY `idx_product_id` (`product_id`),
  KEY `idx_user_id` (`user_id`),
  CONSTRAINT `fk_warehouse_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  CONSTRAINT `fk_warehouse_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='仓库记录表';

-- 10. 门店/支付配置表
CREATE TABLE `store_configs` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `store_id` bigint NOT NULL DEFAULT '0' COMMENT '门店ID (预留多门店支持)',
  `config_key` varchar(50) NOT NULL COMMENT '配置键 (store_name, wechat_mchid, etc)',
  `config_value` text COMMENT '配置值',
  `description` varchar(100) DEFAULT NULL COMMENT '描述',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_store_config` (`store_id`, `config_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统配置表';

-- 预置一些基础配置
INSERT INTO `store_configs` (`store_id`, `config_key`, `config_value`, `description`) VALUES 
(0, 'store_name', 'KTV商户后台', '门店名称'),
(0, 'store_logo', '', '门店Logo'),
(0, 'store_phone', '', '门店电话'),
(0, 'wechat_mchid', '', '微信商户号');
