export const demoPlatform = platform => ({ DOUYIN: '抖音', MEITUAN: '美团', DIANPING: '大众点评' }[platform] || platform || '—')
export const demoState = state => ({ AVAILABLE: '待核销', ISSUED: '待核销', REDEEMED: '已核销', VERIFIED: '已核销', OPEN: '消费中', SETTLED: '已结账', CANCELLED: '已撤销' }[state] || state || '—')
export const demoMoney = value => value === undefined || value === null ? '—' : Number(value).toFixed(2)
export const demoPendingKey = (store, user) => `group-buy-demo-pending:${store}:${user}`
export function demoRequestKey() {
  return crypto.randomUUID()
}
export function readDemoPending(storage, store, user) {
  const raw = storage.getItem(demoPendingKey(store, user))
  if (!raw) return null
  try {
    const operation = JSON.parse(raw)
    if (typeof operation.path !== 'string' || !operation.path.startsWith('/group-buy/demo/') || !operation.body || typeof operation.body.requestKey !== 'string' || !operation.body.requestKey || typeof operation.label !== 'string') throw new Error()
    return operation
  } catch { throw new Error('原模拟操作的恢复记录损坏，请先联系店长核对，暂不能提交其他操作。') }
}
export function saveDemoPending(storage, store, user, operation) {
  try { storage.setItem(demoPendingKey(store, user), JSON.stringify(operation)) }
  catch { throw new Error('无法保存模拟操作的恢复记录，暂不能提交，请检查浏览器本地存储。') }
}
export function clearDemoPending(storage, store, user) {
  storage.removeItem(demoPendingKey(store, user))
}
