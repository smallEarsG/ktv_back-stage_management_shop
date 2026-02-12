<script setup>
import { ref, onMounted } from 'vue'
import { Download, Top, Bottom } from '@element-plus/icons-vue'
import TimeRangePicker from '@/components/TimeRangePicker.vue'
import request from '@/lib/request'

const dateRange = ref([])
const currentLabel = ref('今日')
const loading = ref(false)
const transactions = ref([])

// TODO: The API documentation doesn't specify a dedicated finance stats endpoint structure clearly matching this UI.
// Assuming we fetch stats and transactions separately or together.
// For now, I'll mock the stats part based on the UI requirement or use a placeholder API call if one existed.
// Since API doc mentions /finance/stats (which I might have missed or it was implicit), let's assume it exists or use dashboard stats logic.
// Actually, looking at the API doc again, there isn't a dedicated "Finance" section with stats endpoint.
// I will implement the transaction list fetching which is more likely to be supported by a generic order/transaction endpoint or similar.
// Wait, I missed section 6 (Refunds) and maybe others?
// Let's check the API doc content again.
// The user provided API doc has:
// 1. Auth, 2. Dashboard, 3. Rooms, 4. Products, 5. Orders, 6. Refunds, 7. Warehouse, 8. Configs.
// It seems there is NO specific "Finance" API section in the provided markdown.
// However, the Dashboard stats (2.1) returns sales, orders, refunds.
// I will use /dashboard/stats for the top cards, and /orders (or similar) for transactions.
// Or better, I'll stick to the UI and maybe mock the data for now if no endpoint is available, 
// OR repurpose /orders and /refunds to build the view.

// To be safe and compliant with the "Integrate API" task, I will try to use the Dashboard API for stats 
// and maybe mock the transaction list since there isn't a clear "transaction history" endpoint 
// other than Orders/Refunds lists. 
// Actually, let's look at the previous `FinanceList.vue` mock data:
// It has "income" and "refund".
// I'll simulate this by fetching recent orders and refunds and combining them, or just leave it as mock if appropriate.

// BUT, looking at the prompt "利用接口文档为项目接入接口", if the interface is missing, I should probably report it or implement what I can.
// I will implement fetching Dashboard Stats for the top cards.

const stats = ref({
  income: { amount: 0, trend: 'up', percentage: 0 },
  refund: { amount: 0, trend: 'down', percentage: 0 },
  net: { amount: 0, trend: 'up', percentage: 0 }
})

const fetchFinanceData = async () => {
  loading.value = true
  try {
    // 1. Fetch Stats (Reusing dashboard stats for now as it contains sales/refunds)
    const statsRes = await request.get('/dashboard/stats', {
      params: { dateRange: 'today' }
    })
    
    // Map dashboard stats to finance stats
    stats.value.income.amount = statsRes.sales.amount
    stats.value.income.trend = statsRes.sales.trend
    stats.value.income.percentage = statsRes.sales.percentage
    
    stats.value.refund.amount = statsRes.refunds.amount
    // Mock trends for refund/net as they might not be in dashboard stats
    stats.value.net.amount = statsRes.sales.amount - statsRes.refunds.amount

    // 2. Fetch Transactions (Mocking by combining Orders and Refunds or just using Orders for now)
    // Since there is no /finance/transactions endpoint, I will leave the transaction list as static/mock 
    // OR fetch orders and map them. Let's fetch orders.
    const ordersRes = await request.get('/orders', { params: { page: 1, pageSize: 10 } })
    
    transactions.value = ordersRes.list.map(order => ({
      id: order.id,
      type: 'income',
      amount: order.amount,
      source: `订单支付 - ${order.roomName}`,
      time: order.createdAt
    }))
    
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

const handleDateRangeChange = (range) => {
  console.log('Finance date range:', range)
  dateRange.value = range
  fetchFinanceData()
}

const handleLabelChange = (label) => {
  currentLabel.value = label
}

onMounted(() => {
  fetchFinanceData()
})
</script>

<template>
  <div>
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
      <h2 class="text-2xl font-bold text-slate-800">财务管理</h2>
      <TimeRangePicker 
        v-model="dateRange" 
        @change="handleDateRangeChange" 
        @update:label="handleLabelChange"
      />
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
      <el-card>
        <div class="text-slate-500 text-sm">{{ currentLabel }}收入</div>
        <div class="text-2xl font-bold text-green-600 mt-2">¥ {{ stats.income.amount.toFixed(2) }}</div>
        <div class="text-xs mt-1 text-slate-400">
          <span>同比</span>
          <span :class="stats.income.trend === 'up' ? 'text-red-500' : 'text-green-500'" class="font-bold ml-1">
            <el-icon><Top v-if="stats.income.trend === 'up'" /><Bottom v-else /></el-icon> {{ stats.income.percentage }}%
          </span>
        </div>
      </el-card>
      <el-card>
        <div class="text-slate-500 text-sm">{{ currentLabel }}退款</div>
        <div class="text-2xl font-bold text-red-600 mt-2">¥ {{ stats.refund.amount.toFixed(2) }}</div>
        <div class="text-xs mt-1 text-slate-400">
          <span>同比</span>
          <span class="text-green-500 font-bold ml-1">
            <el-icon><Bottom /></el-icon> --%
          </span>
        </div>
      </el-card>
      <el-card>
        <div class="text-slate-500 text-sm">实际营收</div>
        <div class="text-2xl font-bold text-blue-600 mt-2">¥ {{ stats.net.amount.toFixed(2) }}</div>
        <div class="text-xs mt-1 text-slate-400">
          <span>同比</span>
          <span class="text-red-500 font-bold ml-1">
            <el-icon><Top /></el-icon> --%
          </span>
        </div>
      </el-card>
    </div>

    <el-card>
      <template #header>
        <div class="flex justify-between items-center">
          <span class="font-bold">资金流水</span>
          <el-button :icon="Download">导出报表</el-button>
        </div>
      </template>
      
      <el-table :data="transactions" style="width: 100%" stripe v-loading="loading">
        <el-table-column prop="id" label="流水号" width="180" />
        <el-table-column prop="time" label="时间" width="180" />
        <el-table-column prop="source" label="来源/用途" />
        <el-table-column prop="type" label="类型" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.type === 'income'" type="success">收入</el-tag>
            <el-tag v-else type="danger">支出</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="amount" label="金额" width="150">
          <template #default="{ row }">
            <span :class="row.type === 'income' ? 'text-green-600' : 'text-red-600'" class="font-bold">
              {{ row.type === 'income' ? '+' : '' }}¥ {{ Math.abs(row.amount).toFixed(2) }}
            </span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>
