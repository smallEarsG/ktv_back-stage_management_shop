import dayjs from 'dayjs'
import { dateRangeParams } from './date-range.js'

export const paymentMethods = [{ value: 1, label: '扫码' }, { value: 2, label: '现金' }, { value: 3, label: '挂账' }, { value: 0, label: '其他' }]
export const numeric = value => Number(value ?? 0) || 0
export const formatMoney = value => `¥ ${numeric(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
export const formatTime = value => value && dayjs(value).isValid() ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '—'
export const paymentLabel = (method, channel) => channel === 'demo' ? '演示退款' : paymentMethods.find(item => item.value === numeric(method))?.label || '其他'
export const changeText = metric => {
  if (!metric || metric.comparable === false || metric.percentage == null) return '暂无可比数据'
  if (!numeric(metric.percentage)) return '与上一周期持平'
  return `较上一周期${metric.trend === 'down' ? '下降' : '上升'} ${numeric(metric.percentage).toFixed(1)}%`
}
export const initialFinanceRange = query => {
  if (!query.startDate || !query.endDate || Array.isArray(query.startDate) || Array.isArray(query.endDate)) return []
  const start = dayjs(query.startDate), end = dayjs(query.endDate)
  if (!start.isValid() || !end.isValid() || start.format('YYYY-MM-DD') !== query.startDate || end.format('YYYY-MM-DD') !== query.endDate || end.isBefore(start, 'day')) return []
  return [start.toDate(), end.toDate()]
}
export const financeParams = (range, label = '今日') => ({
  period: ({ 今日: 'today', 本周: 'week', 本月: 'month', 本年: 'year', 自定义: 'custom' })[label] || 'today',
  ...dateRangeParams(range)
})
export const financeRouteQuery = (range, filters = {}) => ({
  ...(range?.length === 2 ? { startDate: dayjs(range[0]).format('YYYY-MM-DD'), endDate: dayjs(range[1]).format('YYYY-MM-DD') } : {}),
  ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== undefined && value !== null && value !== ''))
})
