import { permissionCatalog } from './permission-definitions.js'
export { permissionCatalog }
export const permissionVersion = 'permissions:v2'
const scopes = ['DINING', 'MALL']
const definitions = new Map(permissionCatalog.map(item => [`${item.business}:${item.action}`, item]))
const keyFor = (item, action) => /^(DINING|MALL|COMMON):/.test(action) ? action : `${item.business}:${action}`
export const isV2Permissions = permissions => Array.isArray(permissions) && permissions.includes(permissionVersion)
export function permissionLabel(token) {
  const markers = { 'permissions:v2': '细分操作权限', 'business:scoped': '指定业务范围', 'business:DINING': '点餐业务', 'business:MALL': '商城业务' }
  if (markers[token]) return markers[token]
  const item = definitions.get(token)
  return item ? `${{ DINING: '点餐', MALL: '商城', COMMON: '公共' }[item.business]} · ${item.label}` : null
}

export function hasAction(role, permissions, business, action) {
  if (Array.isArray(action)) return action.some(value => hasAction(role, permissions, business, value))
  if (role === 'admin') return true
  if (!Array.isArray(permissions) || !action) return false
  if (!business || business === 'ALL') return ['DINING', 'MALL', 'COMMON'].some(type => hasAction(role, permissions, type, action))
  if (business !== 'COMMON' && permissions.includes('business:scoped') && !permissions.includes(`business:${business}`)) return false
  if (isV2Permissions(permissions)) {
    if (!permissions.includes('business:scoped')) return false
    if (action === '*') return permissionCatalog.some(item => item.business === business && permissions.includes(`${business}:${item.action}`))
    return definitions.has(`${business}:${action}`) && permissions.includes(`${business}:${action}`)
  }
  const item = definitions.get(`${business}:${action}`)
  return item ? item.legacy.some(value => permissions.includes(value)) : permissions.includes(action)
}

export function normalizePermissions(permissions, businesses) {
  if (!Array.isArray(permissions) || !Array.isArray(businesses) || permissions.length > 200 || permissions.some(token => typeof token !== 'string' || !token.trim())) throw new Error('员工权限格式无效或超过200项')
  const selected = new Set(businesses.filter(type => scopes.includes(type)))
  const result = new Set([permissionVersion, 'business:scoped', ...[...selected].map(type => `business:${type}`)])
  for (const token of permissions) {
    if (token === permissionVersion || token.startsWith('business:')) continue
    const item = definitions.get(token)
    if (!item) throw new Error('权限选项已变化，请重新读取员工配置')
    if (item.business === 'COMMON' || selected.has(item.business)) result.add(token)
  }
  let changed
  do {
    changed = false
    for (const token of [...result]) {
      const item = definitions.get(token)
      if (!item) continue
      if ((item.requiresBusinesses || []).some(type => !selected.has(type))) throw new Error('跨业务共享需要同时选择点餐和商城')
      for (const action of item.dependsOn) {
        const key = keyFor(item, action), dependency = definitions.get(key)
        if (!dependency || (dependency.business !== 'COMMON' && !selected.has(dependency.business))) throw new Error('请先选择操作所需的业务范围')
        if (!result.has(key)) { result.add(key); changed = true }
      }
    }
  } while (changed)
  return [...result].sort()
}

export function toV2Permissions(permissions = [], businesses = []) {
  if (isV2Permissions(permissions)) return normalizePermissions(permissions, businesses)
  const tokens = permissionCatalog.filter(item => (item.business === 'COMMON' || businesses.includes(item.business)) && (item.requiresBusinesses || []).every(type => businesses.includes(type)) && item.legacy.some(value => permissions.includes(value))).map(item => `${item.business}:${item.action}`)
  return normalizePermissions(tokens, businesses)
}

export const roleTemplates = [
  { id: 'manager', label: '店长岗位', description: '可管理所选业务；员工授权、实际储值调整等老板专属操作保持受控。' },
  { id: 'cashier', label: '收银员', description: '点餐开单、台位与结账，不包含退款、商品改价及财务明细。' },
  { id: 'kitchen', label: '后厨', description: '只处理点餐制作和出餐。' },
  { id: 'fulfillment', label: '商城发货员', description: '查看商城订单、发货和核验自提码。' },
  { id: 'operations', label: '会员运营', description: '查看会员、管理会员规则和优惠活动，不含退款与余额增加。' },
  { id: 'finance', label: '财务', description: '查看经营数据、资金、售后与受控导出，不含退款执行和库存修改。' }
]
const templateActions = {
  cashier: { DINING: ['pos:view', 'dining:view', 'dining:manage', 'order:view'] },
  kitchen: { DINING: ['kitchen:operate'] },
  fulfillment: { MALL: ['order:view', 'order:ship', 'order:pickup'] },
  operations: { DINING: ['operations:view', 'operations:edit', 'coupon:manage'], MALL: ['operations:view', 'operations:edit', 'coupon:manage'] },
  finance: { DINING: ['dashboard:view', 'finance:view', 'finance:export', 'refund:view'], MALL: ['dashboard:view', 'finance:view', 'finance:export', 'refund:view'] }
}
export function templatePermissions(id, businesses) {
  if (!roleTemplates.some(item => item.id === id)) throw new Error('岗位模板无效')
  const tokens = id === 'manager'
    ? permissionCatalog.filter(item => (item.business === 'COMMON' || businesses.includes(item.business)) && item.action !== 'wallet:topup' && (item.requiresBusinesses || []).every(type => businesses.includes(type))).map(item => `${item.business}:${item.action}`)
    : businesses.flatMap(type => (templateActions[id]?.[type] || []).map(action => `${type}:${action}`))
  return normalizePermissions(tokens, businesses)
}
