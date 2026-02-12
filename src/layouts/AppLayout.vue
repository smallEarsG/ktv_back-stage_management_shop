<script setup>
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { computed } from 'vue'
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

const menuItems = [
  { path: '/dashboard', icon: Odometer, label: '首页看板', permission: 'dashboard:view' },
  { path: '/orders', icon: List, label: '订单管理', permission: 'order:view' },
  { path: '/products', icon: Goods, label: '商品管理', permission: 'product:view' },
  { path: '/refunds', icon: RefreshLeft, label: '退款售后', permission: 'refund:view' },
  { path: '/finance', icon: Money, label: '财务管理', permission: 'finance:view' },
  { path: '/warehouse', icon: Box, label: '仓库管理', permission: 'warehouse:view' },
  { path: '/settings', icon: Setting, label: '门店设置', permission: 'settings:view' }
]

const filteredMenuItems = computed(() => {
  return menuItems.filter(item => userStore.hasPermission(item.permission))
})

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
        <template v-for="item in filteredMenuItems" :key="item.path">
          <el-menu-item :index="item.path">
            <el-icon><component :is="item.icon" /></el-icon>
            <span>{{ item.label }}</span>
          </el-menu-item>
        </template>
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
  color: #fff !important;
}
:deep(.el-menu-item:hover) {
  background-color: #1e293b !important;
  color: #fff !important;
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
