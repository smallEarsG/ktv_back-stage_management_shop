export const businessLabels = { ALL: '全店经营', DINING: '点餐营业', MALL: '商城经营' }
export const modeLabels = { REAL: '真实交易', SIMULATED: '模拟交易', UNVERIFIED: '待确认交易', ALL: '全部模式' }
export const channelLabels = { wechat: '微信支付', cash: '现金', wallet: '会员余额', demo: '模拟支付', group_buy: '团购抵扣', group_buy_demo: '模拟团购', benefit: '优惠抵扣', legacy: '历史待确认' }
export const insightPermissions = ['dashboard:view', 'finance:view', 'order:view', 'workbench:view', 'pos:view', 'refund:view', 'refund:approve', 'warehouse:view', 'operations:view', 'product:view', 'kitchen:operate', 'service:operate', 'dining:view']
export function businessAllowed(role, permissions, type) {
  return role === 'admin' || (Array.isArray(permissions) && (!permissions.includes('business:scoped') || permissions.includes(`business:${type}`)))
}
export function scopePermissions(permissions, businesses) {
  return [...new Set([...permissions.filter(value => !value.startsWith('business:')), 'business:scoped', ...businesses.filter(type => ['DINING', 'MALL'].includes(type)).map(type => `business:${type}`)])]
}
export const currency = value => Number(value ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export function reportQuery({ business, startsOn, endsOn, mode, ...extra }) {
  return Object.fromEntries(Object.entries({ business, startsOn, endsOn, mode, ...extra }).filter(([, value]) => value !== '' && value != null))
}
