<script setup lang="ts">
import { ref } from 'vue'
import { Download } from '@element-plus/icons-vue'

const transactions = ref([
  { id: 'T2023102701', type: 'income', amount: 356.00, source: '订单支付', time: '10:35' },
  { id: 'T2023102702', type: 'refund', amount: -50.00, source: '订单退款', time: '11:00' },
  { id: 'T2023102703', type: 'income', amount: 128.00, source: '订单支付', time: '10:30' },
])
</script>

<template>
  <div>
    <div class="grid grid-cols-3 gap-6 mb-6">
      <el-card>
        <div class="text-slate-500 text-sm">今日收入</div>
        <div class="text-2xl font-bold text-green-600 mt-2">¥ 484.00</div>
      </el-card>
      <el-card>
        <div class="text-slate-500 text-sm">今日退款</div>
        <div class="text-2xl font-bold text-red-600 mt-2">¥ 50.00</div>
      </el-card>
      <el-card>
        <div class="text-slate-500 text-sm">实际营收</div>
        <div class="text-2xl font-bold text-blue-600 mt-2">¥ 434.00</div>
      </el-card>
    </div>

    <el-card>
      <template #header>
        <div class="flex justify-between items-center">
          <span class="font-bold">资金流水</span>
          <el-button :icon="Download">导出报表</el-button>
        </div>
      </template>
      
      <el-table :data="transactions" style="width: 100%" stripe>
        <el-table-column prop="id" label="流水号" width="180" />
        <el-table-column prop="time" label="时间" width="150" />
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
