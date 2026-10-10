export const sceneNames = { KTV: 'KTV', RESTAURANT: '餐馆', CAFE: '咖啡店', BAR: '酒吧', OTHER: '其他门店' }
export const sessionNames = { OPEN: '使用中', CHECKOUT: '结账中', CLEANING: '待清台', CLOSED: '已结束' }
export const fulfillmentNames = { PENDING: '待接单', PREPARING: '制作中', READY: '待上菜 / 取餐', COMPLETED: '已送达', CANCELED: '已取消' }
export const lineNames = { PENDING: '待制作', PREPARING: '制作中', READY: '已出餐', SERVED: '已送达' }
export const serviceNames = { URGE: '催菜', WATER: '加水', CUTLERY: '补餐具', CHECKOUT: '结账', HELP: '呼叫服务员' }
export const nextLineState = state => ({ PENDING: 'PREPARING', PREPARING: 'READY', READY: 'SERVED' }[state])
export const money = value => Number(value || 0).toFixed(2)
export function attrsText(value) {
  try { const attrs = typeof value === 'string' ? JSON.parse(value) : value; return Object.entries(attrs || {}).map(([key, val]) => `${key}：${Array.isArray(val) ? val.join('、') : val}`).join(' · ') } catch { return '' }
}
export const requestKey = () => `dining-${Date.now()}-${crypto.randomUUID()}`
export const escapeReceipt = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
export function receiptHtml(payload) {
  return `<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><title>出餐小票</title><style>body{font:16px sans-serif;max-width:280px;margin:16px auto;color:#111}h1{font-size:22px}.line{border-top:1px dashed #777;padding:12px 0}p{overflow-wrap:anywhere}@page{size:80mm auto;margin:5mm}@media print{button{display:none}}</style><h1>${escapeReceipt(payload.station)}</h1><p>${escapeReceipt(payload.roomId)} · ${escapeReceipt(payload.headcount)} 人</p><p>${escapeReceipt(payload.orderNo)}</p><p>${escapeReceipt(payload.note)}</p>${(payload.items || []).map(i => `<div class="line"><strong>${escapeReceipt(i.name)} × ${escapeReceipt(i.qty)}</strong><p>${escapeReceipt(i.selectedAttrsJson || '')}</p><p>${escapeReceipt(i.note)}</p></div>`).join('')}<button onclick="window.print()">打印小票</button></html>`
}
export function scenePreset(industry) {
  return { industry, seatLabel: industry === 'KTV' ? '包厢' : industry === 'BAR' ? '台位' : '桌台', paymentMode: industry === 'RESTAURANT' ? 'POSTPAY' : 'PREPAY', allowPickup: ['RESTAURANT', 'CAFE'].includes(industry) }
}
