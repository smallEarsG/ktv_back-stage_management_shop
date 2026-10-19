import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ref } from 'vue'
import { auditSummary } from '../src/lib/governance.js'
import * as governance from '../src/lib/governance.js'

test('merchant audit can filter product changes and resets pagination when switching action', async () => {
  const source = readFileSync(new URL('../src/components/MerchantAudit.vue', import.meta.url), 'utf8')
  const script = source.match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '')
  const calls = []
  const create = new Function('bindings', `const {onBeforeUnmount,onMounted,ref,request,auditSummary,auditActionLabels}=bindings;${script};return {action,page,load,search}`)
  const model = create({ onBeforeUnmount: () => {}, onMounted: () => {}, ref, auditSummary, auditActionLabels: governance.auditActionLabels, request: { get: async (path, config) => { calls.push({ path, config }); return { list: [], total: 0 } } } })
  model.page.value = 5
  model.action.value = 'PRODUCT_GRANT'
  await model.search()
  assert.equal(model.page.value, 1)
  assert.deepEqual(calls[0], { path: '/audit', config: { params: { page: 1, action: 'PRODUCT_GRANT' } } })
  assert.match(source, /el-option[^>]*v-for[^>]*labels/)
})
