export const amountText = value => Number(value || 0).toFixed(2)
export const newRequestKey = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
export const operationsPendingKey = store => `ktv-operations-pending:${store}`
export function rechargePreview(member, amount, bonus) {
  const cents = value => Math.round(Number(value || 0) * 100)
  const principal = cents(member?.principal), gifted = cents(member?.bonus)
  const paid = cents(amount), added = cents(bonus)
  return { amount: paid / 100, bonus: added / 100, credited: (paid + added) / 100, principalAfter: (principal + paid) / 100, bonusAfter: (gifted + added) / 100, balanceAfter: (principal + gifted + paid + added) / 100 }
}
export function promotionState(row, now = Date.now(), coupon = false) {
  if (!row.active) return { text: '已停用', tone: 'info', value: 'disabled' }
  // Server dates use the store's China timezone; browser timezone must not move the boundary.
  const time = value => Date.parse(String(value).replace(' ', 'T') + (/Z$|[+-]\d\d:\d\d$/.test(String(value)) ? '' : '+08:00'))
  if (Number.isFinite(time(row.endsAt)) && time(row.endsAt) <= now) return { text: '已结束', tone: 'info', value: 'ended' }
  if (Number.isFinite(time(row.startsAt)) && time(row.startsAt) > now) return { text: '未开始', tone: 'warning', value: 'upcoming' }
  if (coupon && Number(row.issued || 0) >= Number(row.totalLimit || 0)) return { text: '已领完', tone: 'warning', value: 'exhausted' }
  if (coupon && !row.selfClaim) return { text: '门店发放', tone: '', value: 'manual' }
  return { text: coupon ? '可领取' : '进行中', tone: 'success', value: 'active' }
}
export function skuLabel(sku, product) {
  let specs = sku.skuSpecs
  try { specs = JSON.parse(specs || '[]') } catch { /* Plain historical labels remain readable. */ }
  const describe = value => typeof value === 'object' && value ? (value.value || value.name || Object.values(value).join(' ')) : String(value || '')
  const text = Array.isArray(specs) ? specs.map(describe).filter(Boolean).join(' / ') : typeof specs === 'object' && specs ? Object.values(specs).map(describe).join(' / ') : specs
  return `${product.name}${text ? ` · ${text}` : ''}`
}
export function readOperation(storage, store) {
  const raw = storage.getItem(operationsPendingKey(store))
  if (!raw) return null
  const pending = JSON.parse(raw)
  if (!pending?.url?.startsWith('/operations/members/') || !pending?.body?.requestKey) throw new Error('原操作恢复信息异常，请核对流水')
  return pending
}
export function retainOperation(storage, store, url, body) {
  const previous = readOperation(storage, store)
  if (previous && (previous.url !== url || JSON.stringify(previous.body) !== JSON.stringify(body))) throw new Error('请先查询或重试原操作，再进行新的资金操作')
  const pending = previous || { url, body: JSON.parse(JSON.stringify(body)) }
  storage.setItem(operationsPendingKey(store), JSON.stringify(pending))
  return pending
}
export function clearOperation(storage, store) { storage.removeItem(operationsPendingKey(store)) }
