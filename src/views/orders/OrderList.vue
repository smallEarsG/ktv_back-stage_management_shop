<script setup>
import { ref, reactive, watch, onMounted } from 'vue'
import { Search, Filter } from '@element-plus/icons-vue'
import TimeRangePicker from '@/components/TimeRangePicker.vue'
import request from '@/lib/request'
import { ElMessage } from 'element-plus'

const activeTab = ref('all')
const searchQuery = ref('')
const dateRange = ref([])
const loading = ref(false)
const orders = ref([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(10)

const fetchOrders = async () => {
  loading.value = true
  try {
    const params = {
      page: currentPage.value,
      pageSize: pageSize.value,
      status: activeTab.value === 'all' ? undefined : activeTab.value,
      keyword: searchQuery.value || undefined,
      // dateRange: dateRange.value // Assuming API handles date range if provided
    }
    const res = await request.get('/orders', { params })
    orders.value = res.list || []
    total.value = res.total || 0
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

const handleDateRangeChange = (range) => {
  console.log('Order date range:', range)
  dateRange.value = range
  fetchOrders()
}

const handleStatusChange = async (row, status) => {
  try {
    await request.patch(`/orders/${row.id}/status`, { status })
    ElMessage.success('状态更新成功')
    fetchOrders()
  } catch (e) {
    console.error(e)
  }
}

const handleFilter = () => {
  currentPage.value = 1
  fetchOrders()
}

watch(activeTab, () => {
  currentPage.value = 1
  fetchOrders()
})

onMounted(() => {
  fetchOrders()
})
</script>

<template>
  <div>
    <div class="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-6 gap-4">
      <h2 class="text-2xl font-bold text-slate-800">订单管理</h2>
      <div class="flex flex-wrap gap-2 items-center">
        <TimeRangePicker v-model="dateRange" @change="handleDateRangeChange" />
        <el-input
          v-model="searchQuery"
          placeholder="搜索房间号/订单号"
          class="w-64"
          :prefix-icon="Search"
          @keyup.enter="handleFilter"
        />
        <el-button :icon="Filter" @click="handleFilter">筛选</el-button>
      </div>
    </div>

    <el-tabs v-model="activeTab" class="mb-4">
      <el-tab-pane label="全部订单" name="all" />
      <el-tab-pane label="待接单" name="pending" />
      <el-tab-pane label="配送中" name="delivering" />
      <el-tab-pane label="已完成" name="completed" />
      <el-tab-pane label="退款/异常" name="refund" />
    </el-tabs>

    <el-table :data="orders" style="width: 100%" border stripe v-loading="loading">
      <el-table-column prop="orderNumber" label="订单号" width="120" />
      <el-table-column prop="roomName" label="房间/座位" width="120">
        <template #default="{ row }">
          <el-tag effect="dark" size="large">{{ row.roomName }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="itemsSummary" label="商品明细" min-width="200" show-overflow-tooltip />
      <el-table-column prop="amount" label="金额" width="120">
        <template #default="{ row }">
          <span class="font-bold text-red-500">¥ {{ row.amount.toFixed(2) }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="下单时间" width="180" />
      <el-table-column prop="status" label="状态" width="120">
        <template #default="{ row }">
          <el-tag v-if="row.status === 'pending'" type="warning">待接单</el-tag>
          <el-tag v-else-if="row.status === 'delivering'" type="primary">配送中</el-tag>
          <el-tag v-else-if="row.status === 'completed'" type="success">已完成</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button v-if="row.status === 'pending'" type="primary" size="small" @click="handleStatusChange(row, 'delivering')">接单</el-button>
          <el-button v-if="row.status === 'delivering'" type="success" size="small" @click="handleStatusChange(row, 'completed')">送达</el-button>
          <el-button link type="primary" size="small">详情</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="flex justify-end mt-4">
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :total="total"
        layout="total, prev, pager, next"
        @current-change="fetchOrders"
      />
    </div>
  </div>
</template>
