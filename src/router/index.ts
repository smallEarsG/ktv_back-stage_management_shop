import { createRouter, createWebHistory } from 'vue-router'
import AppLayout from '@/layouts/AppLayout.vue'
import Login from '@/views/Login.vue'
import { useUserStore } from '@/stores/user'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'Login',
      component: Login,
      meta: { title: '登录' }
    },
    {
      path: '/',
      component: AppLayout,
      redirect: '/dashboard',
      children: [
        {
          path: 'dashboard',
          name: 'Dashboard',
          component: () => import('@/views/dashboard/Dashboard.vue'),
          meta: { title: '首页看板', requiresAuth: true }
        },
        {
          path: 'orders',
          name: 'Orders',
          component: () => import('@/views/orders/OrderList.vue'),
          meta: { title: '订单管理', requiresAuth: true }
        },
        {
          path: 'products',
          name: 'Products',
          component: () => import('@/views/products/ProductList.vue'),
          meta: { title: '商品管理', requiresAuth: true }
        },
        {
          path: 'refunds',
          name: 'Refunds',
          component: () => import('@/views/refunds/RefundList.vue'),
          meta: { title: '退款售后', requiresAuth: true }
        },
        {
          path: 'finance',
          name: 'Finance',
          component: () => import('@/views/finance/FinanceList.vue'),
          meta: { title: '财务管理', requiresAuth: true }
        },
        {
          path: 'warehouse',
          name: 'Warehouse',
          component: () => import('@/views/warehouse/WarehouseList.vue'),
          meta: { title: '仓库管理', requiresAuth: true }
        },
        {
          path: 'settings',
          name: 'Settings',
          component: () => import('@/views/settings/SettingsIndex.vue'),
          meta: { title: '门店设置', requiresAuth: true }
        }
      ]
    }
  ]
})

router.beforeEach((to, from, next) => {
  const userStore = useUserStore()
  if (to.meta.requiresAuth && !userStore.token) {
    next('/login')
  } else {
    next()
  }
})

export default router
