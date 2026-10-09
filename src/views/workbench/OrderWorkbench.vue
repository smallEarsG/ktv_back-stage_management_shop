<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Bell, BellFilled, Refresh, Search } from '@element-plus/icons-vue'
import request from '@/lib/request'
import { nextOrderStatus } from '@/lib/order-flow'
import { createPendingMonitor, roomBalancesById } from '@/lib/cashier-workspace'
import RoomBalanceDialog from '@/components/RoomBalanceDialog.vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useUserStore } from '@/stores/user'
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'

dayjs.extend(customParseFormat)

const userStore = useUserStore()
const settleCash = async row => {
  const id = row.orderId || row.id
  if (statusPending[id]) return
  await ElMessageBox.confirm(`请确认已收到 ${roomKeyOf(row)} 此订单的全部现金，再登记结算。`, '现金结算', { type: 'warning' })
  if (statusPending[id] || disposed) return
  statusPending[id] = true
  try { await request.post(`/cashier/orders/${id}/settle`, { payMethod: 2 }); ElMessage.success('现金结算已登记'); await refreshAll(); if (drawerVisible.value) await refreshDrawer() }
  finally { statusPending[id] = false }
}
const TAB_PENDING = 20
const TAB_PREPARING = 30
const TAB_DELIVERING = 40
const TAB_COMPLETED = 50

const tabs = [
  { key: TAB_PENDING, label: '待处理' },
  { key: TAB_PREPARING, label: '备货中' },
  { key: TAB_DELIVERING, label: '配送中' },
  { key: TAB_COMPLETED, label: '已完成' }
]

const route = useRoute()
const routeTab = () => tabs.some(tab => tab.key === Number(route.query.status)) ? Number(route.query.status) : TAB_PENDING
const activeTab = ref(routeTab())
watch(() => route.query.status, () => { activeTab.value = routeTab() })
const loading = ref(false)
const orders = ref([])
const workPage = ref(1)
const workTotal = ref(0)
const serverCounts = ref({ 20: 0, 30: 0, 40: 0, 50: 0, overtime: 0 })
let queryVersion = 0
let pendingRefresh = false
const rooms = ref([])
const roomsLoading = ref(false)
const roomFilter = ref('')
const keyword = ref('')
const soundEnabled = ref(false)
const soundStorageKey = `workbench-sound:${userStore.currentStoreId}:${userStore.userInfo?.id}`
try { soundEnabled.value = localStorage.getItem(soundStorageKey) === 'true' } catch { /* Sound is optional. */ }
const summaryError = ref(''), roomBalances = ref({}), newOrderCount = ref(0)
const balanceDialogVisible = ref(false), balanceRoomId = ref('')
const pendingMonitor = createPendingMonitor()
let summaryFetching = false, audioContext = null

const drawerVisible = ref(false)
const drawerLoading = ref(false)
const drawerOrderId = ref(null)
const orderDetail = ref(null)
const statusPending = reactive({})
const loadError = ref('')
const lastUpdated = ref('')
let fetching = false
let disposed = false

let pollTimer = null

const parseOrderTime = (val) => {
  if (!val) return dayjs('')
  if (val instanceof Date) return dayjs(val)
  const d1 = dayjs(val)
  if (d1.isValid()) return d1
  return dayjs(String(val), 'YYYY-MM-DD HH:mm:ss', true)
}

const formatTime = (val) => {
  const d = parseOrderTime(val)
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm:ss') : (val ? String(val) : '—')
}

const waitMinutes = (row) => {
  const s = Number(row?.status)
  if (![TAB_PENDING, TAB_PREPARING, TAB_DELIVERING].includes(s)) return null
  const d = parseOrderTime(row?.createdAt)
  if (!d.isValid()) return null
  const mins = dayjs().diff(d, 'minute')
  return mins < 0 ? 0 : mins
}

const waitTagType = (mins) => {
  if (mins === null) return 'info'
  if (mins >= 20) return 'danger'
  if (mins >= 10) return 'warning'
  return 'info'
}

const normalizeStatusCode = (val) => {
  if (val === undefined || val === null) return null
  if (typeof val === 'number') return val
  const n = Number(val)
  if (!Number.isNaN(n)) return n
  const s = String(val)
  if (s === 'pending') return 20
  if (s === 'delivering') return 40
  if (s === 'completed') return 50
  if (s === 'refund' || s === 'refunded') return 91
  return null
}

const parseOrderItems = (row) => {
  const txt = String(row?.itemsSummary || '').trim()
  if (!txt) return []
  return txt.split(',').map(s => s.trim()).filter(Boolean)
}

const itemPreview = (row) => {
  const items = parseOrderItems(row)
  const shown = items.slice(0, 3)
  const rest = Math.max(items.length - shown.length, 0)
  return { shown, rest }
}

const statusText = (s) =>
  ({
    20: '待处理',
    30: '备货中',
    40: '配送中',
    50: '已完成'
  }[Number(s)] || String(s ?? ''))

const statusTagType = (s) => {
  const v = Number(s)
  if (v === 20) return 'danger'
  if (v === 30) return 'warning'
  if (v === 40) return 'info'
  if (v === 50) return 'success'
  return 'info'
}

const canAct = (row) => [TAB_PENDING, TAB_PREPARING, TAB_DELIVERING].includes(Number(row?.status))

const nextStatusOf = row => nextOrderStatus(row?.status)

const actionTextOf = (row) => {
  const v = Number(row?.status)
  if (v === TAB_PENDING) return '接单'
  if (v === TAB_PREPARING) return '标记已备齐'
  if (v === TAB_DELIVERING) return '完成'
  return '—'
}

const refreshRooms = async () => {
  roomsLoading.value = true
  try {
    const res = await request.get('/rooms')
    rooms.value = res.list || []
  } catch (e) {
    rooms.value = []
  } finally {
    roomsLoading.value = false
  }
}

const fetchOrders = async (silent = false) => {
  if (disposed) return
  if (fetching) { if (!silent) pendingRefresh = true; return }
  const version = queryVersion
  fetching = true
  if (!silent) loading.value = true
  try {
    const res = await request.get('/orders', { params: { page: workPage.value, pageSize: 24, status: activeTab.value, roomId: roomFilter.value || undefined, keyword: keyword.value || undefined, workbench: true }, silent })
    const list = (res.list || []).map(o => ({
      ...o,
      status: normalizeStatusCode(o.status) ?? o.status,
      payStatus: o?.payStatus ?? o?.pay_status
    }))
    if (disposed || version !== queryVersion) return
    serverCounts.value = res.counters || {}
    workTotal.value = Number(res.total || 0)
    orders.value = list
    loadError.value = ''
    lastUpdated.value = dayjs().format('HH:mm:ss')
  } catch (e) {
    loadError.value = '同步失败，保留上次数据；将在下一轮重试。'
  } finally {
    fetching = false
    loading.value = false
    if (pendingRefresh) { pendingRefresh = false; fetchOrders() }
  }
}

const filteredOrders = computed(() => orders.value)

const roomKeyOf = (row) => {
  const v = row?.roomId ?? row?.roomName
  return v === undefined || v === null ? '' : String(v)
}

const roomUnsettledCounts = computed(() => Object.fromEntries(Object.entries(roomBalances.value).map(([id, row]) => [id, row.unsettledCount])))
const openRoomBalance = row => {
  balanceRoomId.value = roomKeyOf(row)
  if (balanceRoomId.value) balanceDialogVisible.value = true
}

const counts = computed(() => serverCounts.value)
let filterTimer
watch([activeTab, roomFilter, keyword], () => {
  workPage.value = 1
  queryVersion += 1
  clearTimeout(filterTimer)
  filterTimer = setTimeout(() => fetchOrders(), 250)
})
watch(workPage, () => { queryVersion += 1; fetchOrders() })

const beep = () => {
  try {
    const ctx = audioContext || (audioContext = new (window.AudioContext || window.webkitAudioContext)())
    if (ctx.state === 'suspended') { ctx.resume().catch(() => {}); return }
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'sine'
    o.frequency.value = 880
    g.gain.value = 0.08
    o.connect(g)
    g.connect(ctx.destination)
    o.start()
    setTimeout(() => {
      o.stop()
    }, 160)
  } catch {}
}

const toggleSound = async () => {
  soundEnabled.value = !soundEnabled.value
  try { localStorage.setItem(soundStorageKey, String(soundEnabled.value)) } catch { /* Sound is optional. */ }
  if (soundEnabled.value) {
    try {
      if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)()
      await audioContext.resume()
      beep()
    } catch { ElMessage.warning('浏览器暂无法播放声音，新订单仍会显示提示') }
  }
}

const refreshSummary = async () => {
  if (summaryFetching || disposed) return
  summaryFetching = true
  try {
    const result = await request.get('/orders/operations-summary', { silent: true })
    if (disposed) return
    if (!Array.isArray(result.pendingOrderIds) || !Array.isArray(result.roomBalances)) throw new Error('Invalid summary')
    roomBalances.value = roomBalancesById(result.roomBalances)
    const added = pendingMonitor.update(result.pendingOrderIds)
    if (added.length) { newOrderCount.value += added.length; if (soundEnabled.value) beep() }
    summaryError.value = ''
  } catch { if (!disposed) summaryError.value = '新单提醒及房间账款同步失败，将自动重试。' }
  finally { summaryFetching = false }
}

const showNewOrders = () => {
  newOrderCount.value = 0
  activeTab.value = TAB_PENDING; roomFilter.value = ''; keyword.value = ''; workPage.value = 1
  fetchOrders()
}

const refreshAll = () => Promise.all([fetchOrders(), refreshSummary()])

const startPolling = () => {
  if (pollTimer) return
  pollTimer = setInterval(async () => {
    await Promise.all([fetchOrders(true), refreshSummary()])
  }, 10000)
}

const stopPolling = () => {
  if (!pollTimer) return
  clearInterval(pollTimer)
  pollTimer = null
}

const openDrawer = async (row) => {
  const key = orderKeyOf(row)
  if (!key) return
  drawerVisible.value = true
  drawerOrderId.value = key
  drawerLoading.value = true
  orderDetail.value = null
  try {
    const res = await request.get(`/orders/${key}`)
    if (drawerVisible.value && drawerOrderId.value === key) orderDetail.value = res
  } catch (e) {
    if (drawerOrderId.value !== key) return
    console.error(e)
    ElMessage.error('获取订单详情失败')
    drawerVisible.value = false
  } finally {
    if (drawerOrderId.value === key) drawerLoading.value = false
  }
}

const refreshDrawer = async () => {
  if (!drawerOrderId.value) return
  const key = drawerOrderId.value
  drawerLoading.value = true
  try {
    const res = await request.get(`/orders/${key}`)
    if (drawerVisible.value && drawerOrderId.value === key) orderDetail.value = res
  } catch (e) {
    console.error(e)
  } finally {
    if (drawerOrderId.value === key) drawerLoading.value = false
  }
}

const orderKeyOf = (rowOrDetail) => {
  const v = rowOrDetail?.orderId ?? rowOrDetail?.id ?? rowOrDetail?.orderNo ?? rowOrDetail?.orderNumber
  return v === undefined || v === null ? '' : String(v)
}

const isUnsettled = row => Number(row?.payStatus ?? row?.pay_status) === 0

const updateStatus = async (rowOrDetail) => {
  const current = Number(rowOrDetail?.status)
  const next = nextStatusOf({ status: current })
  if (!next) return
  const id = rowOrDetail?.id ?? rowOrDetail?.orderId ?? rowOrDetail?.orderNo ?? rowOrDetail?.orderNumber
  if (!id || statusPending[id]) return
  statusPending[id] = true
  try {
    await request.patch(`/orders/${id}/status`, { status: next })
    rowOrDetail.status = next
    ElMessage.success('操作成功')
    await fetchOrders()
    if (drawerVisible.value) await refreshDrawer()
  } catch (e) {
    console.error(e)
  } finally {
    statusPending[id] = false
  }
}

const specsText = (rowOrItem) => {
  const raw = rowOrItem?.skuSpecs ?? rowOrItem?.sku_specs ?? rowOrItem?.specs
  if (!raw) return '—'
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      const txt = Object.values(obj).join(' / ')
      return txt || '—'
    }
    return String(raw)
  } catch {
    return String(raw)
  }
}

const selectedAttrsText = (item) => {
  const obj = item?.selectedAttrs
  if (!obj || typeof obj !== 'object') return '—'
  const entries = Object.entries(obj)
  if (!entries.length) return '—'
  return entries.map(([k, v]) => `${k}:${Array.isArray(v) ? v.join('/') : v}`).join('，')
}

onMounted(async () => {
  await Promise.all([fetchOrders(), refreshRooms(), refreshSummary()])
  if (disposed) return
  startPolling()
})

onBeforeUnmount(() => {
  disposed = true
  stopPolling()
  clearTimeout(filterTimer)
  if (audioContext) audioContext.close().catch(() => {})
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex justify-between items-center"><div><h2 class="text-2xl font-semibold text-slate-800">订单工作台</h2><p class="mt-1 text-sm text-slate-500">接单 → 备货 → 配送 → 完成 · 每 10 秒自动同步，声音可独立开启</p></div><span class="text-xs text-slate-500">{{ lastUpdated ? `最近同步 ${lastUpdated}` : '正在连接门店' }}</span></div>
    <el-alert v-if="loadError" :title="loadError" type="warning" :closable="false" show-icon />
    <el-alert v-if="summaryError" :title="summaryError" type="warning" :closable="false" show-icon />
    <el-alert v-if="newOrderCount" :title="`门店有 ${newOrderCount} 笔新待处理订单`" type="success" :closable="false" show-icon><el-button size="small" @click="showNewOrders">查看待处理订单</el-button></el-alert>
    <div class="flex flex-col gap-3 xl:flex-row xl:justify-between xl:items-center">
      <div class="flex flex-wrap gap-2 items-center">
        <el-radio-group v-model="activeTab">
          <el-radio-button v-for="t in tabs" :key="t.key" :label="t.key">
            <span class="font-semibold">{{ t.label }}</span>
            <span class="ml-1 text-slate-500">{{ counts[t.key] }}</span>
          </el-radio-button>
        </el-radio-group>
      </div>
      <div class="flex flex-wrap gap-2 items-center">
        <el-button :icon="Refresh" @click="refreshAll">刷新</el-button>
        <el-button :icon="soundEnabled ? BellFilled : Bell" :type="soundEnabled ? 'primary' : 'default'" @click="toggleSound">
          声音提醒
        </el-button>
        <el-select v-model="roomFilter" placeholder="房间筛选" clearable filterable class="w-44" :loading="roomsLoading">
          <el-option v-for="r in rooms" :key="r.id" :label="r.roomNumber" :value="r.roomNumber" />
        </el-select>
        <el-input v-model="keyword" placeholder="搜索房间号/订单号" class="w-64" :prefix-icon="Search" clearable />
      </div>
    </div>

    <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <el-card shadow="never">
        <div class="text-sm text-slate-500">待处理</div>
        <div class="mt-1 text-2xl font-bold text-slate-800">{{ counts[20] }}</div>
      </el-card>
      <el-card shadow="never">
        <div class="text-sm text-slate-500">备货中</div>
        <div class="mt-1 text-2xl font-bold text-slate-800">{{ counts[30] }}</div>
      </el-card>
      <el-card shadow="never">
        <div class="text-sm text-slate-500">配送中</div>
        <div class="mt-1 text-2xl font-bold text-slate-800">{{ counts[40] }}</div>
      </el-card>
      <el-card shadow="never">
        <div class="text-sm text-slate-500">超时订单（≥20分钟）</div>
        <div class="mt-1 text-2xl font-bold text-red-600">{{ counts.overtime }}</div>
      </el-card>
    </div>

    <el-pagination v-model:current-page="workPage" :page-size="24" :total="workTotal" layout="total, prev, pager, next" />
    <div v-loading="loading">
      <div v-if="filteredOrders.length === 0" class="p-10 text-center bg-white rounded border text-slate-400">暂无任务</div>
      <div v-else class="grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-3">
        <el-card v-for="o in filteredOrders" :key="o.id" shadow="hover" class="min-h-60 border">
          <div class="flex flex-col h-full">
            <div class="flex gap-3 justify-between items-start">
              <div class="min-w-0">
                <div class="flex gap-2 items-center">
                  <div class="text-xl font-bold truncate text-slate-800">
                    {{ o.roomId || o.roomName || '—' }}
                  </div>
                  <el-tag :type="statusTagType(o.status)" effect="plain">{{ statusText(o.status) }}</el-tag>
                  <el-tag v-if="isUnsettled(o)" type="warning" effect="plain">挂账未结</el-tag>
                  <el-button v-if="!summaryError && roomUnsettledCounts[roomKeyOf(o)]" link type="warning" size="small" @click="openRoomBalance(o)">房间待结 {{ roomUnsettledCounts[roomKeyOf(o)] }} 单 · ¥ {{ roomBalances[roomKeyOf(o)].unsettledAmount.toFixed(2) }}</el-button>
                </div>
                <div class="mt-1 font-mono text-xs truncate text-slate-500">
                  {{ o.orderNo || o.orderNumber || o.id }}
                </div>
              </div>
              <div class="text-right">
                <div class="text-xs text-slate-500">{{ formatTime(o.createdAt) }}</div>
                <div class="mt-1">
                  <template v-if="waitMinutes(o) !== null">
                    <el-tag :type="waitTagType(waitMinutes(o))" effect="light">已等待 {{ waitMinutes(o) }} 分钟</el-tag>
                  </template>
                </div>
              </div>
            </div>

            <div class="overflow-hidden flex-1 mt-3 space-y-1 min-h-0 text-sm text-slate-700">
              <div v-for="(it, idx) in itemPreview(o).shown" :key="idx" class="truncate">- {{ it }}</div>
              <div v-if="itemPreview(o).rest" class="text-slate-500">+{{ itemPreview(o).rest }}件商品</div>
            </div>

            <div class="flex gap-2 justify-end pt-4 mt-auto">
              <el-button v-if="isUnsettled(o) && userStore.hasPermission('pos:view')" :loading="statusPending[orderKeyOf(o)]" size="small" type="warning" @click="settleCash(o).catch(() => {})">现金结算</el-button>
              <el-button size="small" @click="openDrawer(o)">详情</el-button>
              <el-button v-if="canAct(o)" :loading="statusPending[orderKeyOf(o)]" type="primary" size="small" @click="updateStatus(o)">{{ actionTextOf(o) }}</el-button>
            </div>
          </div>
        </el-card>
      </div>
    </div>

    <el-drawer v-model="drawerVisible" title="订单详情" direction="rtl" size="520px">
      <div v-loading="drawerLoading">
        <template v-if="orderDetail">
          <el-descriptions :column="1" border>
            <el-descriptions-item label="订单号">{{ orderDetail.orderNo || orderDetail.orderNumber || orderDetail.orderId || '—' }}</el-descriptions-item>
            <el-descriptions-item label="房间/桌号">{{ orderDetail.roomId || orderDetail.roomName || '—' }}</el-descriptions-item>
            <el-descriptions-item label="状态">
              <el-tag :type="statusTagType(orderDetail.status)">{{ statusText(orderDetail.status) }}</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="金额">¥ {{ Number(orderDetail.amountTotal || 0).toFixed(2) }}</el-descriptions-item>
            <el-descriptions-item label="实付">¥ {{ Number(orderDetail.amountPaid || 0).toFixed(2) }}</el-descriptions-item>
            <el-descriptions-item label="退款">¥ {{ Number(orderDetail.amountRefunded || 0).toFixed(2) }}</el-descriptions-item>
            <el-descriptions-item label="创建时间">{{ formatTime(orderDetail.createdAt) }}</el-descriptions-item>
            <el-descriptions-item label="支付时间">{{ formatTime(orderDetail.paidAt) }}</el-descriptions-item>
            <el-descriptions-item label="取消时间">{{ formatTime(orderDetail.canceledAt) }}</el-descriptions-item>
            <el-descriptions-item label="完成时间">{{ formatTime(orderDetail.completedAt) }}</el-descriptions-item>
          </el-descriptions>

          <div class="mt-4">
            <div class="mb-2 font-bold text-slate-800">商品明细</div>
            <el-table :data="orderDetail.items || []" border stripe size="small">
              <el-table-column prop="name" label="商品" min-width="160" />
              <el-table-column label="SKU" width="90">
                <template #default="{ row: it }">
                  <el-tag v-if="it.skuCode" size="small" effect="plain">{{ it.skuCode }}</el-tag>
                  <template v-else>—</template>
                </template>
              </el-table-column>
              <el-table-column label="规格" min-width="120">
                <template #default="{ row: it }">{{ specsText(it) }}</template>
              </el-table-column>
              <el-table-column label="已选属性" min-width="140" show-overflow-tooltip>
                <template #default="{ row: it }">{{ selectedAttrsText(it) }}</template>
              </el-table-column>
              <el-table-column prop="qty" label="数量" width="70" align="right" />
            </el-table>
          </div>
        </template>
        <template v-else>
          <div class="text-slate-400">暂无数据</div>
        </template>
      </div>
      <template #footer>
        <div class="flex justify-between items-center w-full">
          <el-button @click="refreshDrawer">刷新详情</el-button>
          <div class="flex gap-2">
            <el-button @click="drawerVisible = false">关闭</el-button>
            <el-button v-if="orderDetail && !summaryError && roomUnsettledCounts[roomKeyOf(orderDetail)]" @click="openRoomBalance(orderDetail)">房间账款</el-button>
            <el-button v-if="orderDetail && isUnsettled(orderDetail) && userStore.hasPermission('pos:view')" type="warning" :loading="statusPending[orderDetail.orderId]" @click="settleCash(orderDetail).catch(() => {})">现金结算</el-button>
            <el-button v-if="orderDetail && canAct(orderDetail)" :loading="statusPending[orderKeyOf(orderDetail)]" type="primary" @click="updateStatus(orderDetail)">{{ actionTextOf(orderDetail) }}</el-button>
          </div>
        </div>
      </template>
    </el-drawer>
    <RoomBalanceDialog v-model="balanceDialogVisible" :room-id="balanceRoomId" @settled="refreshAll" />
  </div>
</template>
