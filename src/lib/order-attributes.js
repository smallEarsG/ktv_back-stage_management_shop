function valueText(value) {
  if (Array.isArray(value)) return value.map(valueText).filter(Boolean).join('、')
  return value == null || typeof value === 'object' ? '' : String(value).trim()
}

export function formatOrderAttributes(raw, { labels = true, separator = labels ? ' · ' : ' / ' } = {}) {
  if (raw == null || raw === '') return ''
  let attributes = raw
  if (typeof raw === 'string') {
    try { attributes = JSON.parse(raw) } catch { return raw.trim() }
  }
  const line = (name, value) => {
    const text = valueText(value), label = valueText(name)
    return text ? labels && label ? label + '：' + text : text : ''
  }
  if (Array.isArray(attributes)) return attributes.map(row => row && typeof row === 'object' && !Array.isArray(row) ? line(row.name, row.value) : valueText(row)).filter(Boolean).join(separator)
  if (attributes && typeof attributes === 'object') return Object.entries(attributes).map(([name, value]) => line(name, value)).filter(Boolean).join(separator)
  return valueText(attributes)
}

export function orderItemProgressText(item = {}) {
  const count = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0
  const canceled = count(item.canceledQty), pending = count(item.pendingReturnQty), refunded = count(item.refundedQty)
  const active = Math.max(0, count(item.remainingQty ?? item.qty) - pending)
  const state = { PENDING: '待制作', PREPARING: '制作中', READY: '已备妥', SERVED: '已送达' }[item.state]
  return [state && active > 0 ? state + ' ' + active + ' 份' : '', pending > 0 ? '退菜处理中 ' + pending + ' 份，暂缓制作' : '', canceled > 0 ? '已退菜 ' + canceled + ' 份' : '', refunded > 0 ? '已退款 ' + refunded + ' 份' : ''].filter(Boolean).join(' · ')
}
