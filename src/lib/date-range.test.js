import test from 'node:test'
import assert from 'node:assert/strict'
import { dateRangeParams } from './date-range.js'

test('inclusive last date includes every hour of that date', () => {
  assert.deepEqual(dateRangeParams([new Date(2026, 9, 1), new Date(2026, 9, 9)]), {
    startTime: '2026-10-01 00:00:00', endTime: '2026-10-10 00:00:00'
  })
})
test('one-day selection and month/year boundaries remain nonempty', () => {
  assert.equal(dateRangeParams([new Date(2026, 11, 31), new Date(2026, 11, 31)]).endTime, '2027-01-01 00:00:00')
  assert.deepEqual(dateRangeParams([]), {})
  assert.throws(() => dateRangeParams([new Date(2026, 9, 9), new Date(2026, 9, 1)]))
})
