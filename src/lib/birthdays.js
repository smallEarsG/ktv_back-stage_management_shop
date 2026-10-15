export const birthdayScopes = [
  { value: '', label: '全部会员' },
  { value: 'TODAY', label: '今日生日', count: 'today' },
  { value: 'NEXT7', label: '近7天生日', count: 'next7' },
  { value: 'THIS_MONTH', label: '本月生日', count: 'thisMonth' },
  { value: 'MISSING', label: '未登记生日', count: 'missing' },
]

export function birthdayDays(month) {
  return Number.isInteger(Number(month)) && Number(month) >= 1 && Number(month) <= 12
    ? new Date(Date.UTC(2000, Number(month), 0)).getUTCDate() : 0
}
export function birthdayValue(month, day) {
  if (!month && !day) return null
  if (!Number.isInteger(Number(day)) || Number(day) < 1 || Number(day) > birthdayDays(month)) return null
  return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
export function birthdayText(value) {
  if (!/^\d{2}-\d{2}$/.test(value || '')) return '未登记'
  const [month, day] = value.split('-').map(Number)
  return birthdayValue(month, day) ? `${month}月${day}日` : '未登记'
}
export function birthdayCountdown(member) {
  if (!member?.birthday || member.daysUntilBirthday == null) return ''
  return Number(member.daysUntilBirthday) === 0 ? '今天生日' : `${Number(member.daysUntilBirthday)}天后生日`
}
