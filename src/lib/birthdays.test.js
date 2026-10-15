import assert from 'node:assert/strict'
import { test } from 'node:test'
import { birthdayValue, birthdayDays, birthdayText, birthdayCountdown } from './birthdays.js'

test('生日仅接受有效月日，闰日无需出生年份，空值可清除', () => {
  assert.equal(birthdayValue(2, 29), '02-29')
  assert.equal(birthdayValue(2, 30), null)
  assert.equal(birthdayValue(4, 31), null)
  assert.equal(birthdayValue('', ''), null)
  assert.equal(birthdayValue(13, 1), null)
  assert.equal(birthdayValue(3, ''), null)
  assert.equal(birthdayDays(2), 29)
  assert.equal(birthdayText('02-29'), '2月29日')
  assert.equal(birthdayText('04-31'), '未登记')
})

test('生日提醒使用服务端倒计时，不把缺失值显示为今天', () => {
  assert.equal(birthdayCountdown({ birthday: '10-15', daysUntilBirthday: 0 }), '今天生日')
  assert.equal(birthdayCountdown({ birthday: '01-01', daysUntilBirthday: 7 }), '7天后生日')
  assert.equal(birthdayCountdown({ birthday: null, daysUntilBirthday: 0 }), '')
  assert.equal(birthdayCountdown({ birthday: '01-01', daysUntilBirthday: null }), '')
})
