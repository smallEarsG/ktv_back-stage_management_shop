export const merchantNavigation = [
  { label: '经营总览', path: '/overview', icon: 'Odometer', common: true, permission: ['dashboard:view', 'finance:view', 'order:view', 'workbench:view', 'pos:view', 'refund:view', 'refund:approve', 'warehouse:view', 'operations:view', 'product:view', 'kitchen:operate', 'service:operate', 'dining:view'] },
  { label: '点餐营业', path: '/dining', icon: 'Shop', product: 'DINING', children: [
    { path: '/pos/index', label: '收银开单', permission: 'pos:view' },
    { path: '/dining/seats', label: '台位营业', permission: 'dining:view' },
    { path: '/workbench', label: '订单工作台', permission: 'workbench:view' },
    { path: '/orders', label: '点餐订单', permission: 'order:view' },
    { path: '/dining/kitchen', label: '后厨出餐', permission: 'kitchen:operate' },
    { path: '/products', label: '菜品与商品', permission: 'product:view' },
    { path: '/refunds', label: '点餐售后', permission: ['refund:view', 'refund:approve'] },
    { path: '/operations/members', label: '点餐会员', permission: 'operations:view' },
    { path: '/operations/wallet', label: '点餐钱包', permission: 'operations:view' },
    { path: '/operations/coupons', label: '点餐优惠券', permission: 'operations:view' },
    { path: '/operations/activities', label: '点餐营销', permission: 'operations:view' },
    { path: '/warehouse', label: '点餐库存', permission: 'warehouse:view' },
    { path: '/dining/services', label: '顾客服务', permission: ['service:operate', 'refund:view', 'refund:approve'] },
    { path: '/dining/shifts', label: '收银交班', permission: 'pos:view' },
    { path: '/dining/prints', label: '出餐小票', permission: 'kitchen:operate' },
    { path: '/group-buy', label: '团购核销', permission: 'pos:view' },
    { path: '/dining/settings', label: '点餐场景设置', permission: 'settings:view' }
  ] },
  { label: '商城经营', path: '/mall', icon: 'ShoppingBag', product: 'MALL', children: [
    { path: '/mall/orders', label: '商城订单与发货', permission: 'order:view' },
    { path: '/mall/products', label: '商城商品', permission: 'product:view' },
    { path: '/mall/aftersales', label: '退款退货与换货', permission: ['refund:view', 'refund:approve'] },
    { path: '/mall/members', label: '商城会员', permission: 'operations:view' },
    { path: '/mall/member-rules', label: '会员规则与等级', permission: 'operations:view' },
    { path: '/mall/coupons', label: '商城优惠券', permission: 'operations:view' },
    { path: '/mall/shipping', label: '配送与运费', permission: 'settings:view' },
    { path: '/mall/sharing', bothProducts: true, label: '商品与库存共享', permission: 'settings:view' },
    { path: '/mall/settings', label: '商城基础设置', permission: 'settings:view' }
  ] },
  { label: '报表与财务', path: '/reports', icon: 'TrendCharts', common: true, children: [
    { path: '/reports', label: '经营报表', permission: ['dashboard:view', 'finance:view'] },
    { path: '/reports/ledger', label: '订单资金明细', permission: 'finance:view' },
    { path: '/reports/shared', label: '会员与库存概览', permission: ['operations:view', 'warehouse:view'] },
    { path: '/finance/overview', label: '点餐财务分析', product: 'DINING', permission: 'finance:view' },
    { path: '/dashboard', label: '点餐营业分析', product: 'DINING', permission: 'dashboard:view' }
  ] },
  { label: '公共管理', path: '/manage', icon: 'Setting', common: true, children: [
    { path: '/settings', label: '门店与员工', permission: 'settings:view' },
    { path: '/services', label: '已购服务', common: true },
    { path: '/account/security', label: '账号安全', common: true }
  ] }
]
export function visibleNavigation(canAccessProduct, hasPermission) {
  return merchantNavigation.filter(item => (item.common || canAccessProduct(item.product)) && (!['/overview', '/reports'].includes(item.path) || canAccessProduct('DINING') || canAccessProduct('MALL'))).map(item => item.children ? { ...item, children: item.children.filter(child => (!child.product || canAccessProduct(child.product)) && (!child.bothProducts || canAccessProduct('DINING') && canAccessProduct('MALL')) && (child.common || hasPermission(child.permission))) } : item).filter(item => item.children ? item.children.length : hasPermission(item.permission))
}
