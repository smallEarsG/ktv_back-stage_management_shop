export const phase2Labels = { DISABLED: '未启用', MOCK: '模拟模式', MANUAL: '手动登记', SIMULATED: '模拟完成', GENERAL: '普通券', BIRTHDAY: '生日券', AVAILABLE: '未使用', LOCKED: '订单预留', USED: '已使用', SUCCESS: '完成', UNKNOWN: '待核对', REJECTED: '未通过', PARTIALLY_SHIPPED: '部分发货', PARTIALLY_REFUNDED: '部分退款', EXCHANGE: '换货', EXCHANGE_READY: '待寄出换货', EXCHANGED: '换货已寄出', LOCAL: '同城配送', POINT_SPEND: '使用积分', POINT_RELEASE: '释放积分', POINT_EARN: '消费赠积分', GOODS_REFUND: '退款积分调整', WALLET_TOPUP: '增加模拟余额', WALLET_PAY: '商城余额付款', WALLET_REFUND: '原路退回商城余额' }
export const phase2Text = value => phase2Labels[value] || value || '—'
export const memberTiersForForm = tiers => tiers.map(tier => ({ ...tier, discountRate: Number(tier.discountBps) / 1000 }))
export function memberTiersForSave(tiers) {
  return tiers.map(({ discountRate, ...tier }) => {
    const rate = Number(discountRate)
    if (!Number.isFinite(rate) || rate < 0.001 || rate > 10 || Math.abs(rate * 1000 - Math.round(rate * 1000)) > 0.000001) throw new Error('会员折扣应为0.001至10折，最多三位小数')
    return { ...tier, discountBps: Math.round(rate * 1000) }
  })
}
export function canReleaseMallIntent(error) {
  const code = Number(error?.code) || Number(error?.response?.status) || Number(error?.statusCode)
  return error?.definitive === true && ![401, 403].includes(code)
}
export function parseBatchCsv(value, expected, limit = 50) {
  const rows = [], row = []; let field = '', quoted = false, closed = false
  const text = String(value).replace(/^\uFEFF/, '')
  if (text.length > 1000000) throw new Error('文件不能超过1MB')
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) { if (char === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else { quoted = false; closed = true } } else field += char }
    else if (char === ',') { row.push(field); field = ''; closed = false }
    else if (char === '\n' || char === '\r') { if (char === '\r' && text[i + 1] === '\n') i++; row.push(field); rows.push(row.splice(0)); field = ''; closed = false }
    else if (char === '"' && !field && !closed) quoted = true
    else { if (closed || char === '"') throw new Error('CSV引号格式错误'); field += char }
    if (rows.length > limit + 1) throw new Error(`每批最多${limit}条`)
  }
  if (quoted) throw new Error('CSV引号未闭合')
  if (field || row.length || closed) { row.push(field); rows.push(row) }
  if (rows.length < 2 || rows[0].join(',') !== expected.join(',')) throw new Error(`表头应为 ${expected.join(',')}`)
  if (rows.length > limit + 1) throw new Error(`每批最多${limit}条`)
  return rows.slice(1).map((cells, index) => { if (cells.length !== expected.length) throw new Error(`第${index + 2}行列数不正确`); return Object.fromEntries(expected.map((key, i) => [key, cells[i]])) })
}
export function downloadCsv(fileName, csv) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a'); link.href = url; link.download = fileName; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
