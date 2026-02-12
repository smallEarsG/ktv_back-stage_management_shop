<script setup>
import { ref, onMounted } from 'vue'
import {
  Money,
  List,
  Bicycle,
  RefreshRight,
  Top,
  Bottom
} from '@element-plus/icons-vue'
import TimeRangePicker from '@/components/TimeRangePicker.vue'
import request from '@/lib/request'

const dateRange = ref([])
const currentLabel = ref('今日')

const stats = ref({
  sales: { amount: 0, trend: 'up', percentage: 0 },
  orders: { pending: 0, delivering: 0, completed: 0 },
  refunds: { count: 0, amount: 0 }
})

const fetchStats = async () => {
  try {
    const res = await request.get('/dashboard/stats', {
      params: {
        dateRange: 'today' // Or calculate from dateRange.value
      }
    })
    stats.value = res
  } catch (e) {
    console.error(e)
  }
}

const handleDateRangeChange = (range) => {
  console.log('Date range changed:', range)
  // Here you would fetch data based on the new range
  fetchStats()
}

const handleLabelChange = (label) => {
  currentLabel.value = label
}

onMounted(() => {
  fetchStats()
})
</script>

<template>
  <div>
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
      <h2 class="text-2xl font-bold text-slate-800">看板</h2>
      <TimeRangePicker 
        v-model="dateRange" 
        @change="handleDateRangeChange" 
        @update:label="handleLabelChange"
      />
    </div>
    
    <!-- Quick Stats / Shortcuts -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      <el-card shadow="hover" class="cursor-pointer hover:border-blue-400 transition-colors">
        <div class="flex items-center">
          <el-icon class="text-blue-500 bg-blue-100 p-3 rounded-full" :size="24"><Money /></el-icon>
          <div class="ml-4">
            <div class="text-slate-500 text-sm">{{ currentLabel }}销售额</div>
            <div class="text-2xl font-bold text-slate-800">¥ {{ stats.sales.amount.toFixed(2) }}</div>
            <div class="text-xs mt-1 text-slate-400">
              <span>同比</span>
              <span :class="stats.sales.trend === 'up' ? 'text-red-500' : 'text-green-500'" class="font-bold ml-1">
                <el-icon><Top v-if="stats.sales.trend === 'up'" /><Bottom v-else /></el-icon> {{ stats.sales.percentage }}%
              </span>
            </div>
          </div>
        </div>
      </el-card>
      
      <el-card shadow="hover" class="cursor-pointer hover:border-orange-400 transition-colors" @click="$router.push('/orders?status=pending')">
        <div class="flex items-center">
          <el-icon class="text-orange-500 bg-orange-100 p-3 rounded-full" :size="24"><List /></el-icon>
          <div class="ml-4">
            <div class="text-slate-500 text-sm">待接单</div>
            <div class="text-2xl font-bold text-orange-600">{{ stats.orders.pending }}</div>
          </div>
        </div>
      </el-card>
      
      <el-card shadow="hover" class="cursor-pointer hover:border-green-400 transition-colors" @click="$router.push('/orders?status=delivering')">
        <div class="flex items-center">
          <el-icon class="text-green-500 bg-green-100 p-3 rounded-full" :size="24"><Bicycle /></el-icon>
          <div class="ml-4">
            <div class="text-slate-500 text-sm">配送中</div>
            <div class="text-2xl font-bold text-green-600">{{ stats.orders.delivering }}</div>
          </div>
        </div>
      </el-card>
      
      <el-card shadow="hover" class="cursor-pointer hover:border-red-400 transition-colors" @click="$router.push('/refunds')">
        <div class="flex items-center">
          <el-icon class="text-red-500 bg-red-100 p-3 rounded-full" :size="24"><RefreshRight /></el-icon>
          <div class="ml-4">
            <div class="text-slate-500 text-sm">退款中</div>
            <div class="text-2xl font-bold text-red-600">{{ stats.refunds.count }}</div>
          </div>
        </div>
      </el-card>
    </div>

    <!-- Charts Placeholder -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <el-card shadow="always">
        <template #header>
          <div class="card-header">
            <span>销售趋势</span>
          </div>
        </template>
        <div class="h-64 flex items-center justify-center bg-slate-50 text-slate-400">
          图表区域 (ECharts)
        </div>
      </el-card>
      
      <el-card shadow="always">
        <template #header>
          <div class="card-header">
            <span>热门商品</span>
          </div>
        </template>
        <div class="h-64 flex items-center justify-center bg-slate-50 text-slate-400">
          图表区域 (ECharts)
        </div>
      </el-card>
    </div>
  </div>
</template>
