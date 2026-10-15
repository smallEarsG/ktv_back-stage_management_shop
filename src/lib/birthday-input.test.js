import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import vm from 'node:vm'
import { computed, effectScope, nextTick, reactive, ref, watch } from 'vue'
import { birthdayDays, birthdayValue } from './birthdays.js'

test('修改月份留下不完整生日时保留原值并禁止提交，补全后才更新', async () => {
  const props = reactive({ modelValue: '01-31' }), events = [], scope = effectScope()
  const source = fs.readFileSync(new URL('../components/BirthdayInput.vue', import.meta.url), 'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '')
  const sandbox = { ref, computed, watch, birthdayDays, birthdayValue, defineProps: () => props, defineEmits: () => (name, value) => events.push({ name, value }) }
  vm.createContext(sandbox)
  scope.run(() => vm.runInContext(source + '\napi = { updateMonth, updateDay, clear, month, day };', sandbox))
  try {
    events.length = 0
    sandbox.api.updateMonth(2); await nextTick()
    assert.equal(sandbox.api.month.value, 2)
    assert.equal(sandbox.api.day.value, '')
    assert.equal(events.some(e => e.name === 'update:modelValue'), false)
    assert.equal(events.findLast(e => e.name === 'invalid-change').value, true)
    sandbox.api.updateDay(29); await nextTick()
    assert.equal(events.findLast(e => e.name === 'update:modelValue').value, '02-29')
    assert.equal(events.findLast(e => e.name === 'invalid-change').value, false)
    sandbox.api.clear(); await nextTick()
    assert.equal(events.findLast(e => e.name === 'update:modelValue').value, null)
  } finally { scope.stop() }
})
