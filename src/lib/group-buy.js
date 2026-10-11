const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
export const recordState = state => ({ VERIFYING: '核销提交中', VERIFIED: '核销成功', REJECTED: '核销未通过', UNKNOWN: '核销结果待确认', CANCELLING: '撤销提交中', CANCEL_UNKNOWN: '撤销结果待确认', CANCELLED: '已撤销' }[state] || '状态待核对')
export const isUncertain = state => ['VERIFYING', 'UNKNOWN', 'CANCELLING', 'CANCEL_UNKNOWN'].includes(state)
export const money = value => value === null || value === undefined ? '—' : Number(value).toFixed(2)
export const pendingKey = (store, user) => `ktv:group-buy:${store}:${user}`
export function readPending(storage, store, user) {
  const source = storage.getItem(pendingKey(store, user))
  if (!source) return null
  let value
  try { value = JSON.parse(source) } catch { throw new Error('原核销记录无法读取，请联系管理员核对后再操作') }
  if (value.version !== 1 || !uuidPattern.test(value.id) || !['verify', 'cancel'].includes(value.action)
    || (value.action === 'verify' && (typeof value.certificateId !== 'string' || !value.certificateId || value.certificateId.length > 128))) {
    throw new Error('原核销记录格式异常，请联系管理员核对后再操作')
  }
  return value
}
export function savePending(storage, store, user, value) {
  try { storage.setItem(pendingKey(store, user), JSON.stringify({ version: 1, ...value })) }
  catch { throw new Error('浏览器无法保存核销记录，请允许本地存储后再操作') }
}
export function clearPending(storage, store, user) { storage.removeItem(pendingKey(store, user)) }
export function operationResolved(pending, record) {
  if (!pending || pending.id !== record?.id) return false
  return pending.action === 'verify' ? ['VERIFIED', 'REJECTED', 'CANCELLED'].includes(record.state)
    : ['CANCELLED', 'VERIFIED'].includes(record.state)
}
