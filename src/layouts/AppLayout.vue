<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import {
  Odometer,
  List,
  Goods,
  RefreshLeft,
  Money,
  Box,
  Setting,
  ArrowDown
} from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const handleLogout = () => {
  userStore.logout()
  router.push('/login')
}
</script>

<template>
  <el-container class="h-screen w-full">
    <el-aside width="220px" class="bg-slate-900 text-white flex flex-col">
      <!-- Logo -->
      <div class="h-16 flex items-center justify-center text-xl font-bold border-b border-slate-800 bg-slate-900">
        <span class="text-blue-500 mr-2">KTV</span> 商户后台
      </div>
      
      <!-- Menu -->
      <el-menu
        :default-active="route.path"
        class="border-none flex-1 overflow-y-auto"
        router
        text-color="#94a3b8"
        active-text-color="#fff"
        background-color="#0f172a"
      >
        <el-menu-item index="/dashboard">
          <el-icon><Odometer /></el-icon>
          <span>首页看板</span>
        </el-menu-item>
        
        <el-menu-item index="/orders">
          <el-icon><List /></el-icon>
          <span>订单管理</span>
        </el-menu-item>
        
        <el-menu-item index="/products">
          <el-icon><Goods /></el-icon>
          <span>商品管理</span>
        </el-menu-item>
        
        <el-menu-item index="/refunds">
          <el-icon><RefreshLeft /></el-icon>
          <span>退款售后</span>
        </el-menu-item>
        
        <el-menu-item index="/finance">
          <el-icon><Money /></el-icon>
          <span>财务管理</span>
        </el-menu-item>
        
        <el-menu-item index="/warehouse">
          <el-icon><Box /></el-icon>
          <span>仓库管理</span>
        </el-menu-item>
        
        <el-menu-item index="/settings">
          <el-icon><Setting /></el-icon>
          <span>门店设置</span>
        </el-menu-item>
      </el-menu>
    </el-aside>
    
    <el-container class="flex-1 flex flex-col min-w-0">
      <el-header class="bg-white border-b h-16 flex items-center justify-between px-6 shadow-sm z-10">
        <!-- Breadcrumb / Title -->
        <div class="text-lg font-medium text-slate-700">
          {{ route.meta.title || '后台管理' }}
        </div>
        
        <!-- User Profile -->
        <el-dropdown trigger="click">
          <span class="cursor-pointer flex items-center text-slate-600 hover:text-slate-900">
            <el-avatar :size="32" class="mr-2 bg-blue-500 text-white">A</el-avatar>
            管理员
            <el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item @click="handleLogout">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </el-header>
      
      <el-main class="bg-slate-50 p-6 overflow-y-auto relative">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
:deep(.el-menu-item.is-active) {
  background-color: #1e293b !important;
  border-right: 3px solid #3b82f6;
}
:deep(.el-menu-item:hover) {
  background-color: #1e293b !important;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
