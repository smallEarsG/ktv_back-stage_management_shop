import { test } from 'node:test'
import assert from 'node:assert/strict'
import { auditSummary } from './governance.js'

test('merchant history explains changed permissions, resets and expiry in business language', () => {
  assert.match(auditSummary({ action: 'STAFF_PERMISSIONS', before: { permissions: [] }, after: { permissions: ['pos:view'] } }), /未分配.*收银/)
  assert.match(auditSummary({ action: 'ACCOUNT_RESET', after: { mustChange: true } }), /下次登录须改密/)
  assert.equal(auditSummary({ action: 'SERVICE_TERM', before: { expiresOn: null }, after: { expiresOn: '2027-10-14' } }), '无期限 → 2027-10-14')
  assert.match(auditSummary({ action: 'STAFF_STATUS', after: { active: false } }), /停用/)
})
