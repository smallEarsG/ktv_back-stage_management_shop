<script setup lang="ts">
import { ref, reactive } from 'vue'
import { Search, Filter } from '@element-plus/icons-vue'

const activeTab = ref('all')
const searchQuery = ref('')

const orders = ref([
  { id: '1001', room: 'A01', amount: 128.00, status: 'pending', time: '10:30', items: '啤酒 x 6, 花生 x 1' },
  { id: '1002', room: 'B02', amount: 356.00, status: 'delivering', time: '10:35', items: '果盘 x 1, 洋酒 x 1' },
  { id: '1003', room: 'C01', amount: 88.00, status: 'completed', time: '09:15', items: '饮料套餐 x 1' },
])

const handleStatusChange = (status: string) => {
  // Logic to update status
  console.log('Update status to', status)
}
</script>

<template>
  <div>
    <div class="flex justify-between items-center mb-6">
      <h2 class="text-2xl font-bold text-slate-800">订单管理</h2>
      <div class="flex gap-2">
        <el-input
          v-model="searchQuery"
          placeholder="搜索房间号/订单号"
          class="w-64"
          :prefix-icon="Search"
        />
        <el-button :icon="Filter">筛选</el-button>
      </div>
    </div>

    <el-tabs v-model="activeTab" class="mb-4">
      <el-tab-pane label="全部订单" name="all" />
      <el-tab-pane label="待接单" name="pending" />
      <el-tab-pane label="配送中" name="delivering" />
      <el-tab-pane label="已完成" name="completed" />
      <el-tab-pane label="退款/异常" name="refund" />
    </el-tabs>

    <el-table :data="orders" style="width: 100%" border stripe>
      <el-table-column prop="id" label="订单号" width="120" />
      <el-table-column prop="room" label="房间/座位" width="120">
        <template #default="{ row }">
          <el-tag effect="dark" size="large">{{ row.room }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="items" label="商品明细" min-width="200" show-overflow-tooltip />
      <el-table-column prop="amount" label="金额" width="120">
        <template #default="{ row }">
          <span class="font-bold text-red-500">¥ {{ row.amount.toFixed(2) }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="time" label="下单时间" width="120" />
      <el-table-column prop="status" label="状态" width="120">
        <template #default="{ row }">
          <el-tag v-if="row.status === 'pending'" type="warning">待接单</el-tag>
          <el-tag v-else-if="row.status === 'delivering'" type="primary">配送中</el-tag>
          <el-tag v-else-if="row.status === 'completed'" type="success">已完成</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button v-if="row.status === 'pending'" type="primary" size="small" @click="handleStatusChange('delivering')">接单</el-button>
          <el-button v-if="row.status === 'delivering'" type="success" size="small" @click="handleStatusChange('completed')">送达</el-button>
          <el-button link type="primary" size="small">详情</el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>
