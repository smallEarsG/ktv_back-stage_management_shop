<script setup lang="ts">
import {
  Money,
  List,
  Bicycle,
  RefreshRight
} from '@element-plus/icons-vue'
</script>

<template>
  <div>
    <h2 class="text-2xl font-bold mb-6 text-slate-800">看板</h2>
    
    <!-- Quick Stats / Shortcuts -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      <el-card shadow="hover" class="cursor-pointer hover:border-blue-400 transition-colors">
        <div class="flex items-center">
          <el-icon class="text-blue-500 bg-blue-100 p-3 rounded-full" :size="24"><Money /></el-icon>
          <div class="ml-4">
            <div class="text-slate-500 text-sm">今日销售额</div>
            <div class="text-2xl font-bold text-slate-800">¥ 0.00</div>
          </div>
        </div>
      </el-card>
      
      <el-card shadow="hover" class="cursor-pointer hover:border-orange-400 transition-colors" @click="$router.push('/orders?status=pending')">
        <div class="flex items-center">
          <el-icon class="text-orange-500 bg-orange-100 p-3 rounded-full" :size="24"><List /></el-icon>
          <div class="ml-4">
            <div class="text-slate-500 text-sm">待接单</div>
            <div class="text-2xl font-bold text-orange-600">0</div>
          </div>
        </div>
      </el-card>
      
      <el-card shadow="hover" class="cursor-pointer hover:border-green-400 transition-colors" @click="$router.push('/orders?status=delivering')">
        <div class="flex items-center">
          <el-icon class="text-green-500 bg-green-100 p-3 rounded-full" :size="24"><Bicycle /></el-icon>
          <div class="ml-4">
            <div class="text-slate-500 text-sm">配送中</div>
            <div class="text-2xl font-bold text-green-600">0</div>
          </div>
        </div>
      </el-card>
      
      <el-card shadow="hover" class="cursor-pointer hover:border-red-400 transition-colors" @click="$router.push('/refunds')">
        <div class="flex items-center">
          <el-icon class="text-red-500 bg-red-100 p-3 rounded-full" :size="24"><RefreshRight /></el-icon>
          <div class="ml-4">
            <div class="text-slate-500 text-sm">退款中</div>
            <div class="text-2xl font-bold text-red-600">0</div>
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
