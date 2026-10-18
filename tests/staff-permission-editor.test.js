import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { computed, ref, watch, effectScope } from 'vue'
import { businessLabels } from '../src/lib/business.js'
import { permissionCatalog, roleTemplates, templatePermissions, toV2Permissions, normalizePermissions, hasAction } from '../src/lib/permissions.js'
import { visibleNavigation } from '../src/lib/navigation.js'

const source = readFileSync(new URL('../src/components/StaffPermissionEditor.vue', import.meta.url), 'utf8')
const script = source.match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '')
const createEditor = new Function('bindings', `const {computed,ref,watch,businessLabels,permissionCatalog,roleTemplates,templatePermissions,toV2Permissions,normalizePermissions,hasAction,visibleNavigation,ElMessage,ElMessageBox,defineProps,defineEmits,defineExpose}=bindings;${script};return {businesses,draft,initial,templateId,loadError,legacy,dirty,businessSections,navigationPreview,sensitiveActions,updatePermission,changeBusinesses,dependencySources,applyTemplate,confirmDiscard,save}`)

function editor(t, permissions, availableBusinesses = ['DINING', 'MALL']) {
  const emitted = [], confirmations = [], errors = []
  const state = { confirm: true }
  const scope = effectScope()
  const result = scope.run(() => createEditor({
    computed, ref, watch, businessLabels, permissionCatalog, roleTemplates, templatePermissions,
    toV2Permissions, normalizePermissions, hasAction, visibleNavigation,
    ElMessage: { error: value => errors.push(value) },
    ElMessageBox: { confirm: (...args) => { confirmations.push(args); return state.confirm ? Promise.resolve() : Promise.reject(new Error('cancel')) } },
    defineProps: () => ({ staff: { id: 8, username: 'staff8', role: 'staff', permissions }, availableBusinesses, saving: false }),
    defineEmits: () => (...args) => emitted.push(args), defineExpose: () => {}
  }))
  t.after(() => scope.stop())
  return { ...result, emitted, confirmations, errors, state }
}
const itemFor = (business, action) => {
  const item = permissionCatalog.find(item => item.business === business && item.action === action)
  assert.ok(item, `missing permission ${business}:${action}`)
  return item
}

test('opening legacy staff retains expanded existing operations and saving sends v2 tokens', t => {
  const model = editor(t, ['order:view', 'product:view'])
  assert.equal(model.legacy.value, true)
  assert.deepEqual(model.draft.value, toV2Permissions(['order:view', 'product:view'], ['DINING', 'MALL']))
  assert.equal(model.dirty.value, false)
  assert.equal(hasAction('staff', model.draft.value, 'DINING', 'order:view'), true)
  assert.equal(hasAction('staff', model.draft.value, 'MALL', 'order:view'), true)
  model.save()
  assert.equal(model.emitted[0][0], 'save')
  assert.ok(model.emitted[0][1].includes('permissions:v2'))
  assert.equal(model.emitted[0][1].some(token => token === 'order:view'), false)
})

test('business-specific grants remain independent and required views are visible in the editor', t => {
  const model = editor(t, ['permissions:v2', 'business:scoped', 'business:DINING', 'business:MALL'])
  const edit = itemFor('MALL', 'product:edit'), view = itemFor('MALL', 'product:view')
  model.updatePermission(edit, true)
  assert.equal(hasAction('staff', model.draft.value, 'MALL', 'product:edit'), true)
  assert.equal(hasAction('staff', model.draft.value, 'MALL', 'product:view'), true)
  assert.equal(hasAction('staff', model.draft.value, 'DINING', 'product:edit'), false)
  assert.ok(model.dependencySources(view).includes(edit.label))
  model.updatePermission(edit, false)
  assert.equal(model.dependencySources(view).length, 0)
  model.updatePermission(view, false)
  assert.equal(hasAction('staff', model.draft.value, 'MALL', 'product:view'), false)
})

test('removing a business requires confirmation and removes its actions from menus and form', async t => {
  const model = editor(t, ['order:view'])
  const previous = [...model.draft.value]
  model.state.confirm = false
  await model.changeBusinesses(['MALL'])
  assert.deepEqual(model.draft.value, previous)
  assert.deepEqual(model.businesses.value, ['DINING', 'MALL'])
  model.state.confirm = true
  await model.changeBusinesses(['MALL'])
  assert.equal(model.draft.value.some(token => token.startsWith('DINING:')), false)
  assert.equal(model.businessSections.value.some(section => section.business === 'DINING'), false)
  assert.equal(model.navigationPreview.value.some(menu => menu.product === 'DINING'), false)
  assert.equal(model.navigationPreview.value.some(menu => menu.product === 'MALL'), true)
})

test('templates never select an unavailable business and canceled template preserves current grants', async t => {
  const model = editor(t, ['order:view'], ['DINING'])
  model.templateId.value = 'fulfillment'
  const previous = [...model.draft.value]
  await model.applyTemplate()
  assert.deepEqual(model.draft.value, previous)
  assert.equal(model.confirmations.length, 0)
  model.templateId.value = 'manager'
  model.state.confirm = false
  await model.applyTemplate()
  assert.deepEqual(model.draft.value, previous)
  model.state.confirm = true
  await model.applyTemplate()
  assert.deepEqual(model.businesses.value, ['DINING'])
  assert.equal(model.draft.value.includes('business:MALL'), false)
  assert.deepEqual(model.draft.value, templatePermissions('manager', ['DINING']))
})

test('mall-only staff do not see dining actions or shared inventory controls', t => {
  const model = editor(t, ['permissions:v2', 'business:scoped', 'business:MALL', 'MALL:order:view'])
  const items = model.businessSections.value.flatMap(section => section.groups.flatMap(group => group.items))
  assert.equal(items.some(item => item.business === 'DINING'), false)
  assert.equal(items.some(item => item.action.startsWith('sharing:')), false)
  assert.equal(model.navigationPreview.value.some(menu => menu.path === '/reports'), false)
})

test('canceling one business also removes its cross-business sharing actions before normalization', async t => {
  const tokens = normalizePermissions(['MALL:sharing:bind'], ['DINING', 'MALL'])
  const model = editor(t, tokens)
  assert.ok(model.draft.value.includes('MALL:sharing:bind'))
  await model.changeBusinesses(['MALL'])
  assert.deepEqual(model.businesses.value, ['MALL'])
  assert.equal(model.draft.value.some(token => token.includes(':sharing:')), false)
  assert.equal(model.draft.value.some(token => token.startsWith('DINING:')), false)
})

test('unsaved adjustments need confirmation while unrecognized legacy grants cannot be overwritten', async t => {
  const model = editor(t, ['permissions:v2', 'business:scoped', 'business:MALL'])
  model.updatePermission(itemFor('MALL', 'order:view'), true)
  assert.equal(model.dirty.value, true)
  model.state.confirm = false
  assert.equal(await model.confirmDiscard(), false)
  model.state.confirm = true
  assert.equal(await model.confirmDiscard(), true)
  const unknown = editor(t, ['unknown:sensitive'])
  assert.ok(unknown.loadError.value)
  unknown.save()
  assert.equal(unknown.emitted.length, 0)
})
