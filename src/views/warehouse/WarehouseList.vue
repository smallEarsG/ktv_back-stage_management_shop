<script setup lang="ts">
import { ref } from 'vue'
import { Search } from '@element-plus/icons-vue'

const stockItems = ref([
  { id: 1, name: '百威啤酒', current: 120, min: 20, status: 'normal' },
  { id: 2, name: '水果拼盘原料(份)', current: 10, min: 15, status: 'low' },
  { id: 3, name: '纸巾(包)', current: 500, min: 50, status: 'normal' },
])
</script>

<template>
  <el-card>
    <template #header>
      <div class="flex justify-between items-center">
        <span class="font-bold">库存查询</span>
        <div class="flex gap-2">
          <el-input placeholder="商品名称" :prefix-icon="Search" class="w-48" />
          <el-button type="primary">入库</el-button>
          <el-button type="warning">盘点</el-button>
        </div>
      </div>
    </template>
    
    <el-table :data="stockItems" style="width: 100%">
      <el-table-column prop="name" label="商品/物料名称" />
      <el-table-column prop="current" label="当前库存" width="150">
        <template #default="{ row }">
          <span :class="row.status === 'low' ? 'text-red-600 font-bold' : ''">{{ row.current }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="min" label="预警库存" width="150" />
      <el-table-column prop="status" label="状态" width="120">
        <template #default="{ row }">
          <el-tag v-if="row.status === 'low'" type="danger">库存不足</el-tag>
          <el-tag v-else type="success">正常</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200">
        <template #default>
          <el-button link type="primary">出入库记录</el-button>
          <el-button link type="primary">调整</el-button>
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>
