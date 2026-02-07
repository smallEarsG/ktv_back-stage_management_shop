<script setup lang="ts">
import { ref } from 'vue'

const refunds = ref([
  { id: 'R1001', orderId: '1005', amount: 50.00, reason: '上菜太慢', status: 'pending', time: '11:00' },
  { id: 'R1002', orderId: '1008', amount: 12.00, reason: '点错了', status: 'approved', time: '10:50' },
])
</script>

<template>
  <el-card>
    <template #header>
      <div class="font-bold">退款售后申请</div>
    </template>
    
    <el-table :data="refunds" style="width: 100%">
      <el-table-column prop="id" label="退款单号" width="120" />
      <el-table-column prop="orderId" label="关联订单" width="120" />
      <el-table-column prop="amount" label="退款金额" width="120">
        <template #default="{ row }">¥ {{ row.amount.toFixed(2) }}</template>
      </el-table-column>
      <el-table-column prop="reason" label="退款原因" />
      <el-table-column prop="time" label="申请时间" width="150" />
      <el-table-column prop="status" label="状态" width="120">
        <template #default="{ row }">
          <el-tag v-if="row.status === 'pending'" type="warning">待处理</el-tag>
          <el-tag v-else-if="row.status === 'approved'" type="success">已通过</el-tag>
          <el-tag v-else type="danger">已拒绝</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="180">
        <template #default="{ row }">
          <div v-if="row.status === 'pending'">
            <el-button type="success" size="small">同意</el-button>
            <el-button type="danger" size="small">拒绝</el-button>
          </div>
          <el-button v-else link type="primary" size="small">查看详情</el-button>
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>
