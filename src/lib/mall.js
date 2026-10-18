export const mallLabels = { PARTIALLY_SHIPPED: '部分发货', PARTIALLY_REFUNDED: '部分退款', EXCHANGE: '换货', EXCHANGE_READY: '待寄出换货', EXCHANGED: '换货已寄出', LOCAL: '同城配送', NOT_CONFIGURED: '未配置', PROCESSING: '退款处理中', ABNORMAL: '需人工核对', CLOSED: '已关闭', CANCELING: '取消待确认', RETURNING: '退货运输中', NOT_IMPLEMENTED: '尚未接通', NOT_VERIFIED: '待验收', DEMO_NOT_REPORTED: '模拟未上报', DRAFT: '未上架', ACTIVE: '已上架', PENDING_PAYMENT: '待付款', PAID: '待履约', SHIPPED: '已发货', COMPLETED: '已完成', AFTERSALE: '售后中', CANCELED: '已取消', REFUNDED: '已退款', PAYMENT_REVIEW: '支付待核对', REQUESTED: '待审核', APPROVED: '已同意', REJECTED: '已拒绝', RECEIVED: '已收退货', REFUNDING: '退款处理中', REFUND: '仅退款', RETURN: '退货退款', EXPRESS: '快递配送', PICKUP: '到店自提', UNPAID: '未付款', PENDING: '处理中', SUCCEEDED: '已完成', SUCCESS: '已完成', FAILED: '失败' }
export const mallText = value => mallLabels[value] || value || '—'
export const mallMoney = value => value == null ? '—' : Number(value).toFixed(2)
export const mallDate = value => value ? String(value).replace('T', ' ').slice(0, 19) : '—'
export const mallSpecs = value => Object.entries(value || {}).map(([key, text]) => `${key}：${text}`).join(' / ') || '默认规格'
export const mallProvinces = ['北京市', '天津市', '河北省', '山西省', '内蒙古自治区', '辽宁省', '吉林省', '黑龙江省', '上海市', '江苏省', '浙江省', '安徽省', '福建省', '江西省', '山东省', '河南省', '湖北省', '湖南省', '广东省', '广西壮族自治区', '海南省', '重庆市', '四川省', '贵州省', '云南省', '西藏自治区', '陕西省', '甘肃省', '青海省', '宁夏回族自治区', '新疆维吾尔自治区', '香港特别行政区', '澳门特别行政区', '台湾省']
export function parseMallSpecs(value) {
  const result = {}
  for (const part of String(value || '').split(/[;；]/).map(item => item.trim()).filter(Boolean)) {
    const index = part.indexOf('=')
    if (index < 1 || index === part.length - 1) throw new Error('规格请按“颜色=蓝色;容量=500ml”填写')
    const key = part.slice(0, index).trim(), text = part.slice(index + 1).trim()
    if (!key || !text || Object.hasOwn(result, key)) throw new Error('规格名称和值不能为空或重复')
    result[key] = text
  }
  return result
}
export const mallPendingKey = (store, app, user) => `mall-pending:${store}:${app}:${user}`
const operationPath = /^\/(orders\/\d+\/(ship|pickup)|skus\/\d+\/stock|aftersales\/\d+\/(decision|receive|refund-retry)|v2\/aftersales\/\d+\/(exchange-ship|withdraw)|v2\/shipments\/\d+\/mock-track)$/
export function mallOperationPermission(path) {
  if (/^\/skus\//.test(path)) return 'warehouse:adjust'
  if (/^\/(?:v2\/)?aftersales\//.test(path)) return 'refund:approve'
  if (/^\/v2\/shipments\//.test(path) || path.endsWith('/ship')) return 'order:ship'
  if (path.endsWith('/pickup')) return 'order:pickup'
  return 'order:view'
}
export function readMallPending(storage, store, app, user) {
  const raw = storage.getItem(mallPendingKey(store, app, user))
  if (!raw) return null
  try {
    const value = JSON.parse(raw)
    if (!operationPath.test(value.path) || !value.body?.requestKey || typeof value.body.requestKey !== 'string' || !Number.isSafeInteger(Number(value.targetId)) || Number(value.targetId) <= 0 || typeof value.label !== 'string') throw new Error()
    return value
  } catch { throw new Error('原商城操作的恢复记录损坏，请先联系店长核对，暂不能提交新操作。') }
}
export function retainMallPending(storage, store, app, user, operation) {
  if (!operationPath.test(operation.path) || !operation.body?.requestKey) throw new Error('商城操作格式不正确')
  const previous = readMallPending(storage, store, app, user)
  if (previous && JSON.stringify(previous) !== JSON.stringify(operation)) throw new Error('请先核对或重试原商城操作')
  try { storage.setItem(mallPendingKey(store, app, user), JSON.stringify(operation)) }
  catch { throw new Error('无法保存操作恢复记录，暂不能提交。请检查浏览器存储空间。') }
  return operation
}
export function clearMallPending(storage, store, app, user) { storage.removeItem(mallPendingKey(store, app, user)) }
export function verifyMallResult(operation, result) {
  if (operation.path.endsWith('/refund-retry')) return !!result && Number(result.aftersaleId) === Number(operation.targetId) && typeof result.refundNo === 'string' && !!result.refundNo
  return !!result && Number(result.id) === Number(operation.targetId)
}
