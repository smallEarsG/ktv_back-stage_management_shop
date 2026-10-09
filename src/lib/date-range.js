import dayjs from 'dayjs'

// Date pickers select inclusive dates; server queries use an exclusive end.
export function dateRangeParams(range) {
  if (!Array.isArray(range) || !range[0] || !range[1]) return {}
  const start = dayjs(range[0]).startOf('day')
  const end = dayjs(range[1]).startOf('day').add(1, 'day')
  if (!start.isValid() || !end.isValid() || !start.isBefore(end)) throw new Error('日期范围不正确')
  return { startTime: start.format('YYYY-MM-DD HH:mm:ss'), endTime: end.format('YYYY-MM-DD HH:mm:ss') }
}
