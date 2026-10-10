export function cashierReceipt(order) {
  if (Number(order?.status) === 90) return { type: 'info', text: '订单已取消，未登记收款。' }
  if (Number(order?.payStatus) === 2) return { type: 'success', text: Number(order.payMethod) === 2 ? Number(order.status) === 20 ? '现金已收款，订单待出餐。' : '现金已收款，订单已完成。' : '渠道已确认收款。' }
  if (Number(order?.payMethod) === 3) return { type: 'warning', text: '已挂账，尚未收款；可在订单列表、详情或工作台登记现金结算。' }
  return { type: 'warning', text: '订单已创建，尚未确认收款；请继续支付或查询原订单。' }
}
export function remainingPaymentSeconds(order, elapsedSeconds = 0) {
  if (!order?.expireAt || !order?.serverNow) return null
  const delta = (new Date(order.expireAt).getTime() - new Date(order.serverNow).getTime()) / 1000
  return Number.isFinite(delta) ? Math.max(0, Math.floor(delta) - elapsedSeconds) : null
}
export function recoveryKey(store, user) { return `pending-cashier-payment:${store}:${user}` }
