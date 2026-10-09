export const cashierWorkspaceKey = (store, user) => `cashier-workspace:v1:${store}:${user}`
export const cloneCart = items => JSON.parse(JSON.stringify(items || []))

export function readCashierWorkspace(storage, key) {
  const raw = storage.getItem(key)
  if (!raw) return { drafts: {}, pending: null }
  const state = JSON.parse(raw)
  if (state.version !== 1 || !state.drafts || typeof state.drafts !== 'object' || Array.isArray(state.drafts)) throw new Error('草稿数据无效')
  if (state.pending && (!state.pending.clientOrderNo || !state.pending.roomId || !Array.isArray(state.pending.items))) throw new Error('待确认订单数据无效')
  return { drafts: state.drafts, pending: state.pending || null }
}

export function writeCashierWorkspace(storage, key, drafts, pending) {
  storage.setItem(key, JSON.stringify({ version: 1, drafts, pending }))
}

export function moneyToCents(value) {
  const text = String(value ?? '').trim()
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null
  const [yuan, fraction = ''] = text.split('.')
  const cents = Number(yuan) * 100 + Number(fraction.padEnd(2, '0'))
  return Number.isSafeInteger(cents) ? cents : null
}

export function cashChange(total, received) {
  const due = moneyToCents(total), tender = moneyToCents(received)
  return due === null || tender === null || tender < due ? null : (tender - due) / 100
}

export function roomBalancesById(rows) {
  return Object.fromEntries((rows || []).map(row => [String(row.roomId), {
    unsettledCount: Number(row.unsettledCount || 0),
    unsettledAmount: Number(row.unsettledAmount || 0),
    pendingPaymentCount: Number(row.pendingPaymentCount || 0)
  }]))
}

export function createPendingMonitor() {
  let seen = null
  return {
    update(ids) {
      const next = new Set(ids.map(String))
      const added = seen === null ? [] : [...next].filter(id => !seen.has(id))
      seen = next
      return added
    }
  }
}
