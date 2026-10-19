import { permissionLabel } from './permissions.js'
const permissions = { 'dining:view': '查看台位营业', 'dining:manage': '开台转台清台', 'kitchen:operate': '后厨制作出餐', 'service:operate': '顾客服务', 'refund:approve': '执行退款', 'dashboard:view': '首页看板', 'pos:view': '收银', 'workbench:view': '订单工作台', 'order:view': '订单管理', 'product:view': '商品管理', 'refund:view': '查看退款', 'finance:view': '财务', 'warehouse:view': '仓库', 'operations:view': '会员运营', 'settings:view': '门店设置', 'settings:edit': '编辑点餐场景' }
export const auditActionLabels = { ACCOUNT_CHANGE: '本人改密', ACCOUNT_RESET: '受控重置密码', STAFF_CREATE: '新增员工', STAFF_DELETE: '删除员工', STAFF_PERMISSIONS: '变更员工权限', STAFF_STATUS: '变更员工状态', MERCHANT_CREATE: '开通商户', MERCHANT_ENABLE: '启用商户', MERCHANT_DISABLE: '停用商户', SERVICE_TERM: '调整点餐期限', PRODUCT_GRANT: '调整产品授权', APPLICATION_STATE: '调整应用状态' }
const serviceStates = { UNLIMITED: '长期有效', ACTIVE: '服务中', EXPIRING: '即将到期', EXPIRED: '已到期', PAUSED: '已暂停', NOT_OPEN: '未开通／授权已撤销' }
function productSnapshot(value = {}, applicationState = false) {
  const labels = { productType: '业务产品', granted: '产品授权', enabled: '新增交易开关', status: applicationState ? '应用状态' : '服务状态', expiresOn: '到期日', canTrade: '实际可新增交易', historyAccessible: '可处理历史业务' }
  return Object.entries(value || {}).filter(([key]) => labels[key]).map(([key, item]) => {
    let text
    if (key === 'productType') text = { DINING: '点餐', MALL: '商城' }[item] || '未知业务'
    else if (key === 'granted') text = item ? '已开通' : '未开通／已撤销'
    else if (key === 'enabled') text = item ? '开启' : '关闭'
    else if (key === 'status') text = (applicationState ? { ACTIVE: '启用', PAUSED: '暂停' } : serviceStates)[item] || '未知状态'
    else text = typeof item === 'boolean' ? item ? '是' : '否' : item ?? '长期有效'
    return `${labels[key]}：${text}`
  }).join('、') || '未记录'
}
export function auditSummary(row) {
  if (['PRODUCT_GRANT', 'APPLICATION_STATE'].includes(row.action)) return `原设置：${productSnapshot(row.before, row.action === 'APPLICATION_STATE')}；新设置：${productSnapshot(row.after, row.action === 'APPLICATION_STATE')}`
  if (row.action === 'SERVICE_TERM') return `${row.before.expiresOn || '无期限'} → ${row.after.expiresOn || '无期限'}`
  if (row.action === 'STAFF_PERMISSIONS') return `原权限：${(row.before.permissions || []).map(p => permissionLabel(p) || permissions[p] || '其他授权').join('、') || '未分配'}；新权限：${(row.after.permissions || []).map(p => permissionLabel(p) || permissions[p] || '其他授权').join('、') || '未分配'}`
  if (['ACCOUNT_CHANGE', 'ACCOUNT_RESET'].includes(row.action)) return row.after.mustChange ? '密码已重置，下次登录须改密' : '密码已修改'
  if ('active' in row.after) return `启用状态：${row.after.active ? '启用' : '停用'}`
  return '—'
}
