export const productNames = { DINING: '点餐', MALL: '商城' }
export const productStatuses = { NOT_OPEN: '未开通', ACTIVE: '服务中', EXPIRING: '即将到期', EXPIRED: '已到期', PAUSED: '已暂停', UNLIMITED: '长期有效' }
export function findProduct(products, type) { return (Array.isArray(products) ? products : []).find(item => item.productType === type) || null }
export function productAccessible(product) { return !!product && product.historyAccessible === true }
export function productTradable(product) { return productAccessible(product) && product.canTrade === true }
const diningHomes = [
  ['/workbench', 'workbench:view'], ['/pos/index', 'pos:view'], ['/dining/seats', 'dining:view'], ['/dining/kitchen', 'kitchen:operate'],
  ['/dining/services', ['service:operate', 'refund:view', 'refund:approve']], ['/dashboard', 'dashboard:view'], ['/orders', 'order:view'],
  ['/products', 'product:view'], ['/refunds', ['refund:view', 'refund:approve']], ['/finance', 'finance:view'], ['/warehouse', 'warehouse:view'], ['/operations/overview', 'operations:view'], ['/settings', 'settings:view']
]
const mallHomes = [['/mall/orders', 'order:view'], ['/mall/products', 'product:view'], ['/mall/aftersales', ['refund:view', 'refund:approve']], ['/mall/report', 'finance:view'], ['/mall/settings', 'settings:view']]
export function firstProductPath(products, hasPermission) {
  const accessible = products.filter(productAccessible)
  const overviewPermissions = ['dashboard:view', 'finance:view', 'order:view', 'workbench:view', 'pos:view', 'refund:view', 'refund:approve', 'warehouse:view', 'operations:view', 'product:view', 'kitchen:operate', 'service:operate', 'dining:view']
  if (accessible.length && overviewPermissions.some(hasPermission)) return accessible.length > 1 ? '/overview' : `/overview?business=${accessible[0].productType}`
  const choices = [['DINING', diningHomes], ['MALL', mallHomes]]
  choices.sort(([a], [b]) => Number(productTradable(findProduct(products, b))) - Number(productTradable(findProduct(products, a))))
  for (const [type, homes] of choices) {
    if (!productAccessible(findProduct(products, type))) continue
    const entry = homes.find(([, permission]) => hasPermission(permission))
    if (entry) return entry[0]
  }
  return '/services'
}
export function routeProduct(path) {
  if (path === '/overview' || path === '/reports' || path.startsWith('/reports/')) return null
  if (path === '/mall' || path.startsWith('/mall/')) return 'MALL'
  if (path === '/' || path === '/login' || path === '/403' || path === '/services' || path === '/settings' || path.startsWith('/account/')) return null
  return 'DINING'
}
