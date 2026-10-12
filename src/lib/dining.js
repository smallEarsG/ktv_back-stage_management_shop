import { formatOrderAttributes } from './order-attributes.js'
export const sceneNames = { KTV: 'KTV', RESTAURANT: '餐馆', CAFE: '咖啡店', BAR: '酒吧', OTHER: '其他门店' }
export const sessionNames = { OPEN: '使用中', CHECKOUT: '结账中', CLEANING: '待清台', CLOSED: '已结束' }
export const fulfillmentNames = { PENDING: '待接单', PREPARING: '制作中', READY: '待上菜 / 取餐', COMPLETED: '已送达', CANCELED: '已取消' }
export const lineNames = { PENDING: '待制作', PREPARING: '制作中', READY: '已出餐', SERVED: '已送达' }
export const serviceNames = { URGE: '催菜', WATER: '加水', CUTLERY: '补餐具', CHECKOUT: '结账', HELP: '呼叫服务员' }
export const nextLineState = state => ({ PENDING: 'PREPARING', PREPARING: 'READY', READY: 'SERVED' }[state])
export const money = value => Number(value || 0).toFixed(2)
export function attrsText(value) {
  return formatOrderAttributes(value)
}
export const requestKey = () => `dining-${Date.now()}-${crypto.randomUUID()}`
export const escapeReceipt = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
export function receiptHtml(payload = {}, { paperWidth = 80 } = {}) {
  const width = paperWidth === 58 ? 58 : 80, settlement = payload.kind === 'SETTLEMENT'
  const line = value => value == null || value === '' ? '' : `<p>${escapeReceipt(value)}</p>`
  const amount = value => Number.isFinite(Number(value)) ? money(value) : '—'
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${settlement ? '结账小票' : '出餐小票'}</title><style>*{box-sizing:border-box}body{font:14px/1.5 sans-serif;width:${width - 10}mm;max-width:100%;margin:5mm auto;color:#111}h1{font-size:20px;margin:8px 0}h2{font-size:16px}.line,.totals{border-top:1px dashed #333;padding:8px 0}p{margin:4px 0;overflow-wrap:anywhere}.price{float:right}.warning{border:2px solid #111;padding:6px}button{margin:12px 0;padding:8px 16px}@page{size:${width}mm auto;margin:5mm}@media print{body{width:auto;margin:0}button{display:none}}</style></head><body><h1>${escapeReceipt(payload.storeName || '门店小票')}</h1><h2>${escapeReceipt(payload.station || (settlement ? '结账小票' : '出餐小票'))}</h2>${line(payload.storePhone ? '联系电话：' + payload.storePhone : '')}${line(payload.roomId === '__PICKUP__' ? '顾客自取' : `${payload.seatLabel || '台位'}：${payload.roomId || '—'} · ${payload.headcount || 1}人`)}${line(payload.receiptNo ? '收据编号：' + payload.receiptNo : '')}${line(payload.orderNo ? '订单：' + payload.orderNo : '')}${line(payload.createdAt ? '时间：' + payload.createdAt : '')}${line(payload.note ? '整单备注：' + payload.note : '')}${payload.pendingReturn ? '<p class="warning">退菜处理中，请暂停打印和制作，先核对售后。</p>' : ''}${line(payload.quantityNote)}${(payload.items || []).map(item => `<div class="line"><strong>${escapeReceipt(item.name)} × ${escapeReceipt(item.qty)}</strong>${settlement && item.payableAmount != null ? `<span class="price">¥${amount(item.payableAmount)}</span>` : ''}${line(formatOrderAttributes(item.selectedAttrsJson || item.selected_attrs_json))}${line(item.note ? '单品备注：' + item.note : '')}${Number(item.pendingReturnQty) > 0 ? line('待退菜：' + item.pendingReturnQty + '份') : ''}</div>`).join('')}${settlement ? `<div class="totals"><p>本次应收：¥${amount(payload.amount)}</p><p>现金实收：¥${amount(payload.tender)}</p><p>找零：¥${amount(payload.change)}</p></div>` : ''}<button onclick="window.print()">打印小票</button></body></html>`
}
export function scenePreset(industry) {
  return { industry, seatLabel: industry === 'KTV' ? '包厢' : industry === 'BAR' ? '台位' : '桌台', paymentMode: industry === 'RESTAURANT' ? 'POSTPAY' : 'PREPAY', allowPickup: ['RESTAURANT', 'CAFE'].includes(industry) }
}
