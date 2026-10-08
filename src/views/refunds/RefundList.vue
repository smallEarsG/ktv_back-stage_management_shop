<script setup>
import { ref, onMounted } from 'vue'
import TimeRangePicker from '@/components/TimeRangePicker.vue'
import request from '@/lib/request'

const dateRange = ref([])
const refunds = ref([])
const loading = ref(false)

const fetchRefunds = async () => {
  loading.value = true
  try {
    const res = await request.get('/refunds', {
      params: {
        // dateRange: dateRange.value
        page: 1,
        pageSize: 50 // Simplified
      }
    })
    refunds.value = res.list || []
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

const handleDateRangeChange = (range) => {
  console.log('Refund date range:', range)
  dateRange.value = range
  fetchRefunds()
}

onMounted(() => {
  fetchRefunds()
})
</script>

<template>
  <div>
    <el-alert title="退款执行尚未接入真实支付渠道。此页仅查询记录，不支持审批或资金退回。" type="info" :closable="false" show-icon class="mb-4" />
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
      <h2 class="text-2xl font-bold text-slate-800">退款售后</h2>
      <TimeRangePicker v-model="dateRange" @change="handleDateRangeChange" />
    </div>

    <el-card>
      <template #header>
        <div class="font-bold">退款售后申请</div>
      </template>
      
      <el-table :data="refunds" style="width: 100%" v-loading="loading">
      <el-table-column prop="refundNo" label="退款单号" width="120" />
      <el-table-column prop="orderId" label="关联订单" width="120" />
      <el-table-column prop="amount" label="退款金额" width="120">
        <template #default="{ row }">¥ {{ row.amount.toFixed(2) }}</template>
      </el-table-column>
      <el-table-column prop="reason" label="退款原因" />
      <el-table-column prop="createdAt" label="申请时间" width="180" />
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
            <el-button type="success" size="small" disabled>同意</el-button>
            <el-button type="danger" size="small" disabled>拒绝</el-button>
          </div>
          <span v-else class="text-slate-400">只读记录</span>
        </template>
      </el-table-column>
    </el-table>
  </el-card>
  </div>
</template>
