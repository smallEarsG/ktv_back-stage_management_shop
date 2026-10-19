import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { test } from 'node:test'
import { computed, reactive, ref } from 'vue'
import { hasAction, isV2Permissions, normalizePermissions } from '../src/lib/permissions.js'
import { visibleNavigation } from '../src/lib/navigation.js'

function settingsPage(permissions, role = 'staff') {
  const calls = [], user = reactive({ permissions, userInfo: { role }, currentStoreId: 1,
    canAccessProduct: () => true,
    hasPermission: (permission, business = 'COMMON') => hasAction(role, permissions, business, permission) })
  const sandbox = { ref, reactive, computed, isV2Permissions, useUserStore: () => user, watch() {}, onMounted() {}, onBeforeUnmount() {},
    request: Object.fromEntries(['get', 'post', 'put', 'delete'].map(method => [method, async (...args) => { calls.push([method, ...args]); return {} }])),
    ElMessage: { warning() {}, success() {} }, ElMessageBox: { confirm: async () => {} }, console }
  vm.createContext(sandbox)
  const script = fs.readFileSync(new URL('../src/views/settings/SettingsIndex.vue', import.meta.url), 'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '').replaceAll('import.meta.env.VITE_DEMO_MODE', "'false'")
  vm.runInContext(script + '\napi = { canEditStore, canReadRooms, canEditRooms, canReadDiningSettings, canReadSeats, saveStore, getRoomList, handleAddRoom, handleEditRoom, submitRoom, handleDeleteRoom, downloadQr, roomDialogVisible, storeProfile };', sandbox)
  return { ...sandbox.api, calls }
}

test('公共只读员工可查门店，但无业务授权时不能编辑资料、读取或操作房间', async () => {
  const page = settingsPage(normalizePermissions(['COMMON:settings:view'], ['DINING']))
  assert.equal(page.canEditStore.value, false)
  assert.equal(page.canReadRooms.value, false)
  assert.equal(page.canEditRooms.value, false)
  assert.equal(page.canReadDiningSettings.value, false)
  assert.equal(page.canReadSeats.value, false)
  Object.assign(page.storeProfile, { storeName: '测试店', contactPhone: '13800000000' })
  await page.saveStore(); await page.getRoomList(); page.handleAddRoom(); await page.handleEditRoom({ id: 1 }); await page.submitRoom(); page.handleDeleteRoom({ id: 1 }); await page.downloadQr({ id: 1 })
  assert.equal(page.calls.length, 0)
  assert.equal(page.roomDialogVisible.value, false)
})

test('点餐设置只读可读房间，编辑权只影响点餐房间而不开放公共资料写入', () => {
  const read = settingsPage(normalizePermissions(['COMMON:settings:view', 'DINING:settings:view'], ['DINING']))
  assert.equal(read.canReadRooms.value, true)
  assert.equal(read.canEditRooms.value, false)
  const edit = settingsPage(normalizePermissions(['COMMON:settings:view', 'DINING:settings:edit'], ['DINING']))
  assert.equal(edit.canReadRooms.value, true)
  assert.equal(edit.canEditRooms.value, true)
  assert.equal(edit.canEditStore.value, false)
})

test('旧员工保留门店资料与房间页面原体验', () => {
  const legacy = settingsPage(['settings:view'])
  assert.equal(legacy.canEditStore.value, true)
  assert.equal(legacy.canReadRooms.value, true)
  assert.equal(legacy.canEditRooms.value, true)
})

test('共享复制和绑定员工能找到入口，旧product:view员工不会新增共享设置入口', () => {
  const storeSource = fs.readFileSync(new URL('../src/stores/user.js', import.meta.url), 'utf8')
  const permissionMethod = storeSource.match(/  function hasPermission\([\s\S]*?(?=  function hasActionPermission)/)[0]
  const createPermissionMethod = new Function('permissions', 'userInfo', 'hasAction', 'isV2Permissions', 'router', 'canAccessProduct', `${permissionMethod}; return hasPermission`)
  function menus(permissions) {
    const hasPermission = createPermissionMethod(ref(permissions), ref({ role: 'staff' }), hasAction, isV2Permissions, { currentRoute: ref({ path: '/overview' }) }, () => true)
    return visibleNavigation(() => true, hasPermission).flatMap(group => group.children || []).map(item => item.path)
  }
  for (const action of ['sharing:copy', 'sharing:bind']) assert.ok(menus(normalizePermissions([`MALL:${action}`], ['DINING', 'MALL'])).includes('/mall/sharing'))
  assert.equal(menus(['product:view']).includes('/mall/sharing'), false)
  assert.equal(menus(['settings:view']).includes('/mall/sharing'), true)
})
