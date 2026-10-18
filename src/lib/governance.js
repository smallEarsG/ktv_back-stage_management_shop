import { permissionLabel } from './permissions.js'
const permissions = { 'dining:view': '查看台位营业', 'dining:manage': '开台转台清台', 'kitchen:operate': '后厨制作出餐', 'service:operate': '顾客服务', 'refund:approve': '执行退款', 'dashboard:view': '首页看板', 'pos:view': '收银', 'workbench:view': '订单工作台', 'order:view': '订单管理', 'product:view': '商品管理', 'refund:view': '查看退款', 'finance:view': '财务', 'warehouse:view': '仓库', 'operations:view': '会员运营', 'settings:view': '门店设置', 'settings:edit': '编辑点餐场景' }
export function auditSummary(row) {
  if (row.action === 'SERVICE_TERM') return `${row.before.expiresOn || '无期限'} → ${row.after.expiresOn || '无期限'}`
  if (row.action === 'STAFF_PERMISSIONS') return `原权限：${(row.before.permissions || []).map(p => permissionLabel(p) || permissions[p] || '其他授权').join('、') || '未分配'}；新权限：${(row.after.permissions || []).map(p => permissionLabel(p) || permissions[p] || '其他授权').join('、') || '未分配'}`
  if (['ACCOUNT_CHANGE', 'ACCOUNT_RESET'].includes(row.action)) return row.after.mustChange ? '密码已重置，下次登录须改密' : '密码已修改'
  if ('active' in row.after) return `启用状态：${row.after.active ? '启用' : '停用'}`
  return '—'
}
