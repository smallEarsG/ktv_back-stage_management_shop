<script setup>
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { computed } from 'vue'
import {
  Odometer,
  ShoppingCart,
  Tickets,
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
  { path: '/pos/index', icon: ShoppingCart, label: '收银台', permission: 'pos:view' },
  { path: '/workbench', icon: Tickets, label: '工作台', permission: 'workbench:view' },
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

const displayName = computed(() => {
  const u = userStore.userInfo || {}
  return u.nickname || u.name || u.username || u.phone || '管理员'
})

const displayRole = computed(() => {
  const r = userStore.userInfo?.role
  if (r === 'admin') return '店长'
  if (r === 'staff') return '员工'
  return r || ''
})

const avatarText = computed(() => {
  const t = String(displayName.value || '').trim()
  return t ? t.slice(0, 1).toUpperCase() : 'A'
})

const handleLogout = () => {
  userStore.logout()
}
</script>

<template>
  <el-container class="w-full h-screen">
    <el-aside width="220px" class="flex flex-col text-white bg-slate-900">
      <!-- Logo -->
      <div class="flex justify-center items-center h-16 text-xl font-bold border-b border-slate-800 bg-slate-900">
        <span class="mr-2 text-blue-500">KTV</span> 商户后台
      </div>
      
      <!-- Menu -->
      <el-menu
        :default-active="route.path"
        class="overflow-y-auto flex-1 border-none"
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
    
    <el-container class="flex flex-col flex-1 min-w-0">
      <el-header class="flex z-10 justify-between items-center px-6 h-16 bg-white border-b shadow-sm">
        <!-- Breadcrumb / Title -->
        <div class="text-lg font-medium text-slate-700">
          {{ route.meta.title || '后台管理' }}
        </div>
        
        <!-- User Profile -->
        <el-dropdown trigger="click">
          <span class="flex items-center cursor-pointer text-slate-600 hover:text-slate-900">
            <el-avatar :size="32" class="mr-2 text-white bg-blue-500">{{ avatarText }}</el-avatar>
            <span class="truncate max-w-40">{{ displayName }}</span>
            <el-tag v-if="displayRole" size="small" effect="plain" class="ml-2">{{ displayRole }}</el-tag>
            <el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item @click="handleLogout">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </el-header>
      
      <el-main class="overflow-y-auto relative p-6 bg-slate-50">
        <router-view v-slot="{ Component }">
          <transition name="fade">
            <Suspense>
              <component :is="Component" :key="route.fullPath" />
              <template #fallback>
                <div class="p-6 bg-white rounded border text-slate-400">页面加载中…</div>
              </template>
            </Suspense>
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
