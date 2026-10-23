import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRecoveryStorage, canReleaseRecovery } from './recovery-storage.js'

const memory = () => {
  const data = new Map()
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) }
}
test('unknown-result records are isolated by API, deployment path, storage prefix and employee', () => {
  const raw = memory(), base = { VITE_API_BASE_URL: '/api', BASE_URL: '/merchant/', VITE_STORAGE_PREFIX: '' }
  const original = createRecoveryStorage(raw, 9, base)
  original.setItem('pending', 'immutable-original')
  for (const [actor, env] of [[10, base], [9, { ...base, VITE_API_BASE_URL: '/demo/api' }], [9, { ...base, BASE_URL: '/demo/merchant/' }], [9, { ...base, VITE_STORAGE_PREFIX: 'demo_' }]]) {
    const other = createRecoveryStorage(raw, actor, env)
    assert.equal(other.getItem('pending'), null)
    other.setItem('pending', 'another-request'); other.removeItem('pending')
    assert.equal(original.getItem('pending'), 'immutable-original')
  }
  assert.equal(createRecoveryStorage(raw, 9, base).getItem('pending'), 'immutable-original')
})
test('unscoped legacy records are retained and block automatic retry and replacement', () => {
  const raw = memory(); raw.setItem('pending', '{"requestKey":"original"}')
  const current = createRecoveryStorage(raw, 9, { VITE_API_BASE_URL: '/api' })
  assert.throws(() => current.getItem('pending'), error => error.code === 'RECOVERY_LEGACY')
  assert.throws(() => current.setItem('pending', 'new'), /旧版恢复记录/)
  current.removeItem('pending')
  assert.equal(raw.getItem('pending'), '{"requestKey":"original"}')
})
test('only explicit business rejections release an unknown-result intent; authentication does not', () => {
  for (const code of [401, 403, 500, 503, undefined]) assert.equal(canReleaseRecovery({ definitive: true, code }), false)
  for (const code of [400, 409, 422]) assert.equal(canReleaseRecovery({ code }), true)
  assert.equal(canReleaseRecovery({ code: 400, response: { status: 403 } }), false)
  assert.equal(canReleaseRecovery(new Error('response lost')), false)
})
