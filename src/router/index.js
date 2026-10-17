import { createRouter, createWebHistory } from 'vue-router'
import AppLayout from '@/layouts/AppLayout.vue'
import Login from '@/views/Login.vue'
import { useUserStore } from '@/stores/user'
import { routeProduct } from '@/lib/products'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'Login',
      component: Login,
      meta: { title: '登录' }
    },
    {
      path: '/403',
      name: '403',
      component: () => import('@/views/403.vue'),
      meta: { title: '无权限' }
    },
    {
      path: '/',
      component: AppLayout,
      redirect: '/services',
      children: [
        { path: 'services', name: 'ProductServices', component: () => import('@/views/ProductServices.vue'), meta: { title: '已购服务', requiresAuth: true } },
        ...['products', 'orders', 'aftersales', 'settings', 'report'].map(tab => ({ path: `mall/${tab}`, name: `Mall-${tab}`, component: () => import('@/views/mall/MallConsole.vue'), meta: { title: { products: '商城商品', orders: '商城订单', aftersales: '商城售后', settings: '商城设置', report: '商城报表' }[tab], requiresAuth: true, mallTab: tab, permission: { products: 'product:view', orders: 'order:view', aftersales: ['refund:view', 'refund:approve'], settings: 'settings:view', report: 'finance:view' }[tab] } })),
        ...['members', 'shipping', 'batch', 'sharing'].map(tab => ({ path: `mall/${tab}`, name: `Mall-growth-${tab}`, component: () => import('@/views/mall/MallGrowth.vue'), meta: { title: { members: '会员与营销', shipping: '配送与物流', batch: '批量工作台', sharing: '共享设置' }[tab], requiresAuth: true, mallGrowth: tab, permission: { members: 'operations:view', shipping: 'settings:view', batch: ['product:view', 'order:view', 'finance:view'], sharing: 'settings:view' }[tab] } })),
        { path: 'mall', redirect: '/mall/orders' },
        { path: 'account/security', name: 'AccountSecurity', component: () => import('@/views/AccountSecurity.vue'), meta: { title: '修改密码', requiresAuth: true } },
        ...['seats', 'kitchen', 'services', 'prints', 'shifts', 'settings'].map(tab => ({
          path: `dining/${tab}`, name: `Dining-${tab}`,
          component: () => import('@/views/dining/DiningConsole.vue'),
          meta: { title: { seats: '台位营业', kitchen: '后厨出餐', services: '服务与售后', prints: '出餐小票', shifts: '收银交班', settings: '点餐场景' }[tab], requiresAuth: true, permission: { seats: 'dining:view', kitchen: 'kitchen:operate', services: ['service:operate', 'refund:view', 'refund:approve'], prints: 'kitchen:operate', shifts: 'pos:view', settings: 'settings:view' }[tab], diningTab: tab }
        })),
        ...['overview', 'members', 'wallet', 'coupons', 'activities'].map(tab => ({
          path: `operations/${tab}`,
          name: `Operations-${tab}`,
          component: () => import('@/views/operations/OperationsCenter.vue'),
          meta: { title: '运营中心', requiresAuth: true, permission: 'operations:view', operationTab: tab }
        })),
        { path: 'operations', redirect: '/operations/overview' },
        { path: 'group-buy', name: 'GroupBuy', component: () => import('@/views/group-buy/GroupBuyConsole.vue'), meta: { title: '团购核销', requiresAuth: true, permission: 'pos:view' } },
        { path: 'group-buy/demo', name: 'GroupBuyDemo', component: () => import('@/views/group-buy/GroupBuyDemoConsole.vue'), meta: { title: '团购模拟演练', requiresAuth: true, permission: 'pos:view' } },
        {
          path: 'dashboard',
          name: 'Dashboard',
          component: () => import('@/views/dashboard/Dashboard.vue'),
          meta: { title: '首页看板', requiresAuth: true, permission: 'dashboard:view' }
        },
        {
          path: 'orders',
          name: 'Orders',
          component: () => import('@/views/orders/OrderList.vue'),
          meta: { title: '订单管理', requiresAuth: true, permission: 'order:view' }
        },
        {
          path: 'pos/index',
          name: 'PosIndex',
          component: () => import('@/views/pos/PosIndex.vue'),
          meta: { title: '收银台', requiresAuth: true, permission: 'pos:view' }
        },
        {
          path: 'workbench',
          name: 'OrderWorkbench',
          component: () => import('@/views/workbench/OrderWorkbench.vue'),
          meta: { title: '工作台', requiresAuth: true, permission: 'workbench:view' }
        },
        {
          path: 'products',
          name: 'Products',
          component: () => import('@/views/products/ProductList.vue'),
          meta: { title: '商品管理', requiresAuth: true, permission: 'product:view' }
        },
        {
          path: 'refunds',
          name: 'Refunds',
          component: () => import('@/views/refunds/RefundList.vue'),
          meta: { title: '退款售后', requiresAuth: true, permission: ['refund:view', 'refund:approve'] }
        },
        {
          path: 'finance',
          name: 'Finance',
          redirect: '/finance/overview',
          meta: { title: '财务管理', requiresAuth: true, permission: 'finance:view' }
        },
        {
          path: 'finance/overview',
          name: 'FinanceOverview',
          component: () => import('@/views/finance/FinanceOverview.vue'),
          meta: { title: '财务看板', requiresAuth: true, permission: 'finance:view' }
        },
        {
          path: 'finance/flows',
          name: 'FinanceFlows',
          component: () => import('@/views/finance/FinanceList.vue'),
          meta: { title: '资金流水', requiresAuth: true, permission: 'finance:view' }
        },
        {
          path: 'warehouse',
          name: 'Warehouse',
          component: () => import('@/views/warehouse/WarehouseList.vue'),
          meta: { title: '仓库管理', requiresAuth: true, permission: 'warehouse:view' }
        },
        {
          path: 'settings',
          name: 'Settings',
          component: () => import('@/views/settings/SettingsIndex.vue'),
          meta: { title: '门店设置', requiresAuth: true, permission: 'settings:view' }
        }
      ]
    }
  ]
})

router.beforeEach(async (to, from, next) => {
  const userStore = useUserStore()
  if (to.meta.requiresAuth && userStore.token) {
    try { await userStore.refresh() } catch { userStore.logout(); next('/login'); return }
    await userStore.refreshProducts()
  }
  if (to.meta.requiresAuth && !userStore.token) {
    next('/login')
  } else if (to.meta.requiresAuth && userStore.userInfo?.passwordChangeRequired && to.path !== '/account/security') {
    next('/account/security')
  } else if (to.meta.permission && !userStore.hasPermission(to.meta.permission)) {
    next('/403')
  } else if (to.meta.requiresAuth && routeProduct(to.path) && !userStore.canAccessProduct(routeProduct(to.path))) {
    next({ path: '/services', query: { unavailable: routeProduct(to.path) } })
  } else {
    next()
  }
})

const isDynamicImportError = (err) => {
  const msg = String(err?.message || err || '')
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('Loading chunk') ||
    msg.includes('ChunkLoadError')
  )
}

router.onError((err) => {
  if (!isDynamicImportError(err)) return
  const key = `__reload_once__${location.pathname}${location.search}${location.hash}`
  if (sessionStorage.getItem(key)) return
  sessionStorage.setItem(key, '1')
  location.reload()
})

export default router
