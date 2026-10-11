export const fulfillmentPendingKey = (store, user) => `ktv:group-buy-fulfillment:${store}:${user}`
const pathPattern = /^\/group-buy\/(linked-demo\/vouchers|records\/[0-9a-f-]{36}\/(fulfill|settle|payout))$/
export function readFulfillmentPending(storage, store, user) {
  const raw = storage.getItem(fulfillmentPendingKey(store, user))
  if (!raw) return null
  let value
  try { value = JSON.parse(raw) } catch { throw new Error('原团购联动操作无法读取，请联系管理员核对') }
  if (!value || !pathPattern.test(value.path) || !value.body || typeof value.body !== 'object' || typeof value.label !== 'string') throw new Error('原团购联动操作格式损坏，请联系管理员核对')
  return value
}
export function saveFulfillmentPending(storage, store, user, value) {
  storage.setItem(fulfillmentPendingKey(store, user), JSON.stringify(value))
  if (readFulfillmentPending(storage, store, user)?.path !== value.path) throw new Error('无法保存原操作，请允许本地存储后再操作')
}
export const clearFulfillmentPending = (storage, store, user) => storage.removeItem(fulfillmentPendingKey(store, user))
export const validateFulfillmentResponse = (operation, result) => {
  const id = operation.path.match(/records\/([^/]+)/)?.[1]
  if (operation.path.endsWith('/fulfill')) return result?.redemptionId === id && Number(result.sessionId) > 0 && Number(result.packageOrderId) > 0
  if (operation.path.endsWith('/settle')) return result?.redemptionId === id && result.requestKey === operation.body.requestKey
  if (operation.path.endsWith('/payout')) return Array.isArray(result?.list) && result.list.some(row => row.redemptionId === id && row.statementNo === operation.body.statementNo)
  return !!result?.id && result.simulation === true && result.platform === operation.body.platform && result.platformSkuId === operation.body.platformSkuId
}
