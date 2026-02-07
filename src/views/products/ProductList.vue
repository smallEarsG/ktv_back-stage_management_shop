<script setup lang="ts">
import { ref } from 'vue'
import { Plus, Edit, Delete } from '@element-plus/icons-vue'

const activeCategory = ref('drinks')
const showEditDrawer = ref(false)

const products = ref([
  { id: 1, name: '百威啤酒', price: 15.00, stock: 120, status: true, image: '' },
  { id: 2, name: '青岛啤酒', price: 12.00, stock: 85, status: true, image: '' },
  { id: 3, name: '可乐', price: 8.00, stock: 200, status: true, image: '' },
  { id: 4, name: '水果拼盘', price: 68.00, stock: 10, status: false, image: '' },
])

const handleAdd = () => {
  showEditDrawer.value = true
}
</script>

<template>
  <div class="flex h-full gap-4">
    <!-- Category Sidebar (Simplified as Card) -->
    <el-card class="w-48 flex-shrink-0" :body-style="{ padding: '0' }">
      <div class="p-4 border-b font-bold bg-slate-50">商品分类</div>
      <el-menu default-active="1" class="border-none">
        <el-menu-item index="1">酒水饮料</el-menu-item>
        <el-menu-item index="2">小食零食</el-menu-item>
        <el-menu-item index="3">果盘</el-menu-item>
        <el-menu-item index="4">套餐</el-menu-item>
      </el-menu>
    </el-card>

    <!-- Product List -->
    <el-card class="flex-1">
      <template #header>
        <div class="flex justify-between items-center">
          <span class="font-bold">商品列表</span>
          <el-button type="primary" :icon="Plus" @click="handleAdd">新增商品</el-button>
        </div>
      </template>

      <el-table :data="products" style="width: 100%">
        <el-table-column prop="image" label="图片" width="80">
          <template #default>
            <div class="w-10 h-10 bg-slate-200 rounded"></div>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="商品名称" />
        <el-table-column prop="price" label="价格" width="100">
          <template #default="{ row }">¥ {{ row.price.toFixed(2) }}</template>
        </el-table-column>
        <el-table-column prop="stock" label="库存" width="100">
           <template #default="{ row }">
             <span :class="row.stock < 20 ? 'text-red-500 font-bold' : ''">{{ row.stock }}</span>
           </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-switch v-model="row.status" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default>
            <el-button link type="primary" :icon="Edit">编辑</el-button>
            <el-button link type="danger" :icon="Delete">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- Edit Drawer -->
    <el-drawer v-model="showEditDrawer" title="编辑商品" size="500px">
      <el-form label-width="80px">
        <el-form-item label="商品名称">
          <el-input placeholder="请输入商品名称" />
        </el-form-item>
        <el-form-item label="价格">
          <el-input-number :min="0" :precision="2" />
        </el-form-item>
        <el-form-item label="库存">
          <el-input-number :min="0" :precision="0" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary">保存</el-button>
          <el-button @click="showEditDrawer = false">取消</el-button>
        </el-form-item>
      </el-form>
    </el-drawer>
  </div>
</template>
