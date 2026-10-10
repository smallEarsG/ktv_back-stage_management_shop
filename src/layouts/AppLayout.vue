<script setup>
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
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
  ArrowDown,
  Shop
} from '@element-plus/icons-vue'

const demoMode = import.meta.env.VITE_DEMO_MODE !== 'false'
const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const compactQuery = window.matchMedia('(max-width: 750px)')
const compactSidebar = ref(compactQuery.matches)
const updateSidebar = event => { compactSidebar.value = event.matches }
onMounted(() => compactQuery.addEventListener('change', updateSidebar))
onBeforeUnmount(() => compactQuery.removeEventListener('change', updateSidebar))

const menuItems = [
  { path: '/dining', icon: Shop, label: '点餐营业', permission: 'dining:view', children: [
    { path: '/dining/seats', label: '台位营业', permission: 'dining:view' },
    { path: '/dining/kitchen', label: '后厨出餐', permission: 'kitchen:operate' },
    { path: '/dining/services', label: '服务与售后', permission: ['service:operate', 'refund:view', 'refund:approve'] },
    { path: '/dining/shifts', label: '收银交班', permission: 'pos:view' },
    { path: '/dining/settings', label: '点餐场景', permission: 'settings:view' }
  ] },
  { path: '/dashboard', icon: Odometer, label: '首页看板', permission: 'dashboard:view' },
  { path: '/pos/index', icon: ShoppingCart, label: '收银台', permission: 'pos:view' },
  { path: '/workbench', icon: Tickets, label: '工作台', permission: 'workbench:view' },
  { path: '/orders', icon: List, label: '订单管理', permission: 'order:view' },
  { path: '/products', icon: Goods, label: '商品管理', permission: 'product:view' },
  { path: '/refunds', icon: RefreshLeft, label: '退款售后', permission: 'refund:view' },
  { path: '/finance', icon: Money, label: '财务管理', permission: 'finance:view', children: [
    { path: '/finance/overview', label: '财务看板' },
    { path: '/finance/flows', label: '资金流水' }
  ] },
  { path: '/warehouse', icon: Box, label: '仓库管理', permission: 'warehouse:view' },
  { path: '/operations', icon: Tickets, label: '运营中心', permission: 'operations:view', children: [
    { path: '/operations/overview', label: '运营看板' },
    { path: '/operations/members', label: '会员管理' },
    { path: '/operations/wallet', label: '会员钱包' },
    { path: '/operations/coupons', label: '优惠券' },
    { path: '/operations/activities', label: '营销活动' }
  ] },
  { path: '/settings', icon: Setting, label: '门店设置', permission: 'settings:view' }
]

const filteredMenuItems = computed(() => {
  return menuItems.map(item => item.children ? { ...item, children: item.children.filter(child => userStore.hasPermission(child.permission)) } : item)
    .filter(item => item.path === '/dining' ? item.children.length : userStore.hasPermission(item.permission))
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
  <el-container class="app-shell">
    <el-aside width="220px" class="app-sidebar" :class="{ 'sidebar-compact': compactSidebar }">
      <!-- Logo -->
      <div class="sidebar-brand">
        <span class="brand-icon"><el-icon><Shop /></el-icon></span>
        <span class="brand-name">商户后台</span>
      </div>
      
      <!-- Menu -->
      <el-scrollbar class="sidebar-scroll">
        <el-menu
          :default-active="route.path"
          :default-openeds="['/finance']"
          :collapse="compactSidebar"
          :collapse-transition="false"
          class="sidebar-menu"
          unique-opened
          router
          text-color="#94a3b8"
          active-text-color="#fff"
          background-color="#0f172a"
        >
          <template v-for="item in filteredMenuItems" :key="item.path">
            <el-sub-menu v-if="item.children" :index="item.path" :aria-label="item.label">
              <template #title><el-icon><component :is="item.icon" /></el-icon><span>{{ item.label }}</span></template>
              <el-menu-item v-for="child in item.children" :key="child.path" :index="child.path">{{ child.label }}</el-menu-item>
            </el-sub-menu>
            <el-menu-item v-else :index="item.path" :aria-label="item.label">
              <el-icon><component :is="item.icon" /></el-icon>
              <span>{{ item.label }}</span>
            </el-menu-item>
          </template>
        </el-menu>
      </el-scrollbar>
    </el-aside>
    
    <el-container class="app-content">
      <el-header class="app-header">
        <!-- Breadcrumb / Title -->
        <div class="header-title">
          {{ route.meta.title || '后台管理' }}
        </div>
        
        <!-- User Profile -->
        <el-dropdown trigger="click">
          <span class="user-profile">
            <el-avatar :size="34" class="profile-avatar">{{ avatarText }}</el-avatar>
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
      
      <el-main class="app-main" :class="{ 'cashier-main': route.name === 'PosIndex' }">
        <el-alert v-if="demoMode" title="演示环境 · 仅使用测试数据；演示支付不扣款，真实支付和退款未开放。" type="info" :closable="false" class="mb-5" show-icon />
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
.app-shell {
  width: 100%;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
}
.app-sidebar {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: #fff;
  background: #0f172a;
  border-right: 1px solid #1e293b;
}
.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 64px;
  flex-shrink: 0;
  padding: 0 24px;
  border-bottom: 1px solid #ffffff0d;
  font-size: 19px;
  font-weight: 650;
  letter-spacing: .5px;
}
.brand-icon {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 1px solid #ffffff1a;
  border-radius: 9px;
  background: #ffffff0a;
  color: #93c5fd;
  font-size: 19px;
}
.sidebar-scroll {
  flex: 1;
  min-height: 0;
}
.sidebar-scroll :deep(.el-scrollbar__bar.is-vertical) {
  right: 3px;
  width: 4px;
}
.sidebar-scroll :deep(.el-scrollbar__thumb) {
  background: #64748b;
}
.sidebar-menu {
  --el-menu-item-height: 44px;
  --el-menu-sub-item-height: 40px;
  --el-menu-base-level-padding: 14px;
  --el-menu-level-padding: 18px;
  padding: 14px 10px;
  border: 0;
}
.sidebar-menu :deep(.el-menu-item),
.sidebar-menu :deep(.el-sub-menu__title) {
  margin-bottom: 4px;
  border-radius: 8px;
  font-size: 13px;
  transition: background-color .15s, color .15s;
}
.sidebar-menu :deep(.el-icon) {
  margin-right: 10px;
  font-size: 17px;
}
.sidebar-menu :deep(.el-sub-menu__icon-arrow) {
  right: 14px;
  margin-right: 0;
  font-size: 12px;
}
.sidebar-menu :deep(.el-sub-menu .el-menu) {
  padding: 2px 0 6px;
}
.sidebar-menu :deep(.el-sub-menu .el-menu-item) {
  min-width: 0;
  height: 40px;
  padding-left: 42px;
}
.sidebar-menu :deep(.el-menu-item.is-active) {
  border-right: 0;
  background: #1e3a5f;
  color: #fff;
  font-weight: 600;
  box-shadow: inset 3px 0 #60a5fa;
}
.sidebar-menu :deep(.el-menu-item:hover),
.sidebar-menu :deep(.el-sub-menu__title:hover) {
  background: #1e293b;
  color: #fff;
}
.sidebar-menu :deep(.el-menu-item.is-active:hover) {
  background: #1e3a5f;
}
.sidebar-menu :deep(.el-menu-item:focus-visible),
.sidebar-menu :deep(.el-sub-menu__title:focus-visible) {
  outline: 2px solid #93c5fd;
  outline-offset: -2px;
}
.sidebar-compact .sidebar-brand {
  justify-content: center;
  padding: 0;
}
.sidebar-compact .brand-name {
  display: none;
}
.sidebar-compact .sidebar-menu {
  width: 100%;
  padding-right: 8px;
  padding-left: 8px;
}
.sidebar-compact .sidebar-menu :deep(.el-icon) {
  margin-right: 0;
}
.sidebar-compact .sidebar-menu :deep(.el-menu-item),
.sidebar-compact .sidebar-menu :deep(.el-sub-menu__title) {
  justify-content: center;
  padding: 0;
}
.sidebar-compact .sidebar-menu :deep(.el-menu-tooltip__trigger) {
  justify-content: center;
  padding: 0;
}
.sidebar-compact .sidebar-menu :deep(.el-sub-menu.is-active > .el-sub-menu__title) {
  color: #fff;
  background: #1e3a5f;
  box-shadow: inset 3px 0 #60a5fa;
}
.app-content {
  flex: 1;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
}
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;
  flex-shrink: 0;
  padding: 0 32px;
  background: #fff;
  border-bottom: 1px solid #e2e8f0;
}
.header-title {
  color: #334155;
  font-size: 15px;
  font-weight: 600;
}
.user-profile {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  border-radius: 8px;
  color: #475569;
  cursor: pointer;
}
.user-profile:hover {
  background: #f8fafc;
}
.profile-avatar {
  background: #eff6ff;
  color: #2563eb;
  font-weight: 600;
}
.app-main {
  position: relative;
  min-height: 0;
  padding: 30px 32px;
  background: #f6f8fc;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #cbd5e1 transparent;
}
.cashier-main {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
}
.cashier-main > .el-alert {
  flex-shrink: 0;
  margin-bottom: 0;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
@media (max-width: 1100px) {
  .app-sidebar { width: 200px; }
  .sidebar-brand { padding: 0 20px; }
  .app-header { padding: 0 24px; }
  .app-main { padding: 24px; }
  .cashier-main { padding: 16px; }
}
@media (max-width: 750px) {
  .app-sidebar { width: 72px; }
  .sidebar-brand { gap: 8px; padding: 0 16px; font-size: 17px; }
  .sidebar-menu { padding-right: 8px; padding-left: 8px; }
  .app-header { padding: 0 16px; }
  .app-main { padding: 20px 16px; }
  .cashier-main { padding: 16px; }
}
</style>
