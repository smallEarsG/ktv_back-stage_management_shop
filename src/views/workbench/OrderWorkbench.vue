<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Bell, BellFilled, CircleCheck, Clock, Refresh, Search, Warning } from '@element-plus/icons-vue'
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
  { key: TAB_PENDING, label: '待处理', hint: '及时接单', tone: 'pending' },
  { key: TAB_PREPARING, label: '备货中', hint: '核对商品，准备配送', tone: 'preparing' },
  { key: TAB_DELIVERING, label: '配送中', hint: '送达房间后确认完成', tone: 'delivering' },
  { key: TAB_COMPLETED, label: '已完成', hint: '查看已完成订单', tone: 'completed' }
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
const overtimeOnly = ref(false)
const now = ref(Date.now())
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
  const mins = dayjs(now.value).diff(d, 'minute')
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
  const shown = items.slice(0, 3).map(text => {
    const match = text.match(/^(.*?)\s*[x×]\s*(\d+)\s*$/i)
    return { name: match ? match[1].trim() : text, qty: match ? match[2] : null }
  })
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
  if (v === 20) return 'primary'
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
  if (v === TAB_DELIVERING) return '完成配送'
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
    now.value = Date.now()
    const params = { page: workPage.value, pageSize: 24, status: activeTab.value, roomId: roomFilter.value || undefined, keyword: keyword.value.trim() || undefined, workbench: true }
    // Filter before pagination; keep status counters independent of the time filter.
    const endTime = overtimeOnly.value && activeTab.value !== TAB_COMPLETED
      ? dayjs(now.value).subtract(20, 'minute').add(1, 'second').format('YYYY-MM-DD HH:mm:ss') : undefined
    const [res, countResult] = await Promise.all([
      request.get('/orders', { params: { ...params, endTime }, silent }),
      endTime ? request.get('/orders', { params: { ...params, page: 1, pageSize: 1 }, silent: true }) : Promise.resolve(null)
    ])
    const list = (res.list || []).map(o => ({
      ...o,
      status: normalizeStatusCode(o.status) ?? o.status,
      payStatus: o?.payStatus ?? o?.pay_status
    }))
    if (disposed || version !== queryVersion) return
    serverCounts.value = (countResult || res).counters || {}
    workTotal.value = Number(res.total || 0)
    orders.value = list
    loadError.value = ''
    lastUpdated.value = dayjs().format('HH:mm:ss')
  } catch (e) {
    if (disposed || version !== queryVersion) return
    loadError.value = '同步失败，保留上次数据；将在下一轮重试。'
  } finally {
    fetching = false
    loading.value = false
    if (pendingRefresh) { pendingRefresh = false; fetchOrders() }
  }
}

const filteredOrders = computed(() => orders.value)
const activeStatusLabel = computed(() => statusText(activeTab.value))
const hasFilters = computed(() => !!roomFilter.value || !!keyword.value.trim() || overtimeOnly.value)
const emptyTitle = computed(() => loadError.value ? '订单暂时无法加载' : hasFilters.value ? '没有符合筛选条件的订单' : `暂无${activeStatusLabel.value}订单`)
const emptyDescription = computed(() => loadError.value ? '请刷新重试，或等待自动同步。' : hasFilters.value ? '试试其他房间、关键词，或清除筛选。' : activeTab.value === TAB_COMPLETED ? '完成配送的订单会显示在这里。' : '新任务会自动同步到这里。')
const clearFilters = () => { roomFilter.value = ''; keyword.value = ''; overtimeOnly.value = false }
const formatOrderTime = val => {
  const date = parseOrderTime(val)
  if (!date.isValid()) return '—'
  return date.format(date.isSame(dayjs(now.value), 'day') ? 'HH:mm' : 'MM-DD HH:mm')
}
const moneyText = val => Number(val || 0).toFixed(2)
const isOvertime = row => waitMinutes(row) !== null && waitMinutes(row) >= 20

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
watch(activeTab, value => { if (value === TAB_COMPLETED) overtimeOnly.value = false }, { flush: 'sync' })
watch([activeTab, roomFilter, keyword, overtimeOnly], () => {
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
  activeTab.value = TAB_PENDING; clearFilters(); workPage.value = 1
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
  <div class="order-workbench">
    <header class="workbench-header">
      <div>
        <h2 class="text-2xl font-semibold text-slate-800">订单工作台</h2>
        <p class="mt-1 text-sm text-slate-500">及时接单 · 备齐商品 · 确认送达</p>
      </div>
      <div class="header-tools">
        <span class="sync-status" role="status">
          <span class="sync-dot" :class="{ 'sync-dot-warning': loadError || summaryError }" />
          {{ loadError || summaryError ? '同步异常' : lastUpdated ? `同步于 ${lastUpdated}` : '正在连接门店' }}
        </span>
        <el-button :icon="Refresh" :loading="loading" @click="refreshAll()">刷新</el-button>
        <el-button :icon="soundEnabled ? BellFilled : Bell" :type="soundEnabled ? 'primary' : 'default'" plain :aria-pressed="soundEnabled" @click="toggleSound">
          {{ soundEnabled ? '声音已开启' : '声音已关闭' }}
        </el-button>
      </div>
    </header>
    <el-alert v-if="loadError" :title="loadError" type="warning" :closable="false" show-icon />
    <el-alert v-if="summaryError" :title="summaryError" type="warning" :closable="false" show-icon />
    <div v-if="newOrderCount" class="new-order-notice" role="status">
      <span><el-icon><BellFilled /></el-icon> 有 {{ newOrderCount }} 笔新订单待处理</span>
      <el-button type="primary" link @click="showNewOrders">查看新订单 →</el-button>
    </div>

    <div class="status-strip" role="group" aria-label="订单状态">
      <button v-for="tab in tabs" :key="tab.key" type="button" class="status-entry" :class="[`status-${tab.tone}`, { 'is-active': activeTab === tab.key }]" :aria-pressed="activeTab === tab.key" :title="tab.hint" @click="activeTab = tab.key">
        <div class="status-entry-top"><span><span class="status-dot" />{{ tab.label }}</span><strong>{{ counts[tab.key] ?? 0 }}</strong></div>
      </button>
    </div>

    <div class="filter-bar">
      <div class="filter-fields">
        <el-input v-model="keyword" placeholder="搜索房间号 / 订单号" aria-label="搜索房间号或订单号" class="keyword-input" :prefix-icon="Search" clearable />
        <el-select v-model="roomFilter" placeholder="全部房间" aria-label="房间筛选" clearable filterable class="room-select" :loading="roomsLoading">
          <el-option v-for="r in rooms" :key="r.id" :label="r.roomNumber" :value="r.roomNumber" />
        </el-select>
      </div>
      <div class="filter-extras">
        <el-checkbox v-model="overtimeOnly" :disabled="activeTab === TAB_COMPLETED" class="overtime-toggle">只看超时</el-checkbox>
        <span class="overtime-summary"><el-icon><Clock /></el-icon> 超时 {{ counts.overtime ?? 0 }} 单 <span class="threshold-note">≥20 分钟</span></span>
        <el-button v-if="hasFilters" link @click="clearFilters">清除筛选</el-button>
      </div>
    </div>

    <div class="list-caption">
      <h3>{{ activeStatusLabel }}订单 <span>{{ workTotal }} 单</span></h3>
      <span>{{ overtimeOnly ? '仅显示当前状态下等待满 20 分钟的订单' : activeTab === TAB_COMPLETED ? '最近完成的订单在前' : '按下单时间排序，较早订单在前' }}</span>
    </div>
    <div v-loading="loading" class="order-list" :aria-busy="loading">
      <div v-if="filteredOrders.length === 0 && !loading" class="empty-orders">
        <el-icon :size="38"><Search v-if="hasFilters" /><Clock v-else-if="loadError" /><CircleCheck v-else /></el-icon>
        <h3>{{ emptyTitle }}</h3>
        <p>{{ emptyDescription }}</p>
        <el-button v-if="loadError" @click="refreshAll()">重新加载</el-button>
        <el-button v-else-if="hasFilters" @click="clearFilters">清除筛选</el-button>
      </div>
      <div v-else class="order-grid">
        <article v-for="o in filteredOrders" :key="orderKeyOf(o)" class="order-card" :class="{ 'order-card-overdue': isOvertime(o) }" :aria-label="`${roomKeyOf(o)} ${statusText(o.status)}订单`">
          <div class="order-card-header">
            <div class="room-heading"><span class="room-caption">房间</span><h3 :title="roomKeyOf(o)">{{ roomKeyOf(o) || '—' }}</h3></div>
            <el-tag :type="statusTagType(o.status)" effect="light" size="small">{{ statusText(o.status) }}</el-tag>
          </div>
          <div class="order-meta">
            <span class="order-number" :title="o.orderNo || o.orderNumber || String(o.id)">{{ o.orderNo || o.orderNumber || o.id }}</span>
            <span :title="formatTime(o.createdAt)">{{ formatOrderTime(o.createdAt) }} 下单</span>
          </div>

          <div class="order-products">
            <div v-for="(item, idx) in itemPreview(o).shown" :key="idx" class="product-line">
              <span :title="item.name">{{ item.name }}</span><strong v-if="item.qty">× {{ item.qty }}</strong>
            </div>
            <el-button v-if="itemPreview(o).rest" link class="more-products" @click="openDrawer(o)">另有 {{ itemPreview(o).rest }} 种商品，查看全部</el-button>
            <p v-if="!itemPreview(o).shown.length" class="text-sm text-slate-400">查看详情确认商品</p>
          </div>

          <div class="order-card-bottom">
            <div class="order-timing">
              <span v-if="waitMinutes(o) !== null" class="wait-indicator" :class="`wait-${waitTagType(waitMinutes(o))}`">
                <el-icon><Warning v-if="isOvertime(o)" /><Clock v-else /></el-icon>
                {{ isOvertime(o) ? '超时 · 已等待' : '已等待' }} <strong>{{ waitMinutes(o) }}</strong> 分钟
              </span>
              <span v-else class="completed-indicator"><el-icon><CircleCheck /></el-icon> {{ statusText(o.status) }}</span>
              <span class="order-amount">¥ {{ moneyText(o.amount ?? o.amountTotal) }}</span>
            </div>
            <div v-if="isUnsettled(o) || (!summaryError && roomUnsettledCounts[roomKeyOf(o)])" class="order-balance">
              <span v-if="isUnsettled(o)" class="unsettled-label">本单挂账未结</span>
              <el-button v-if="!summaryError && roomUnsettledCounts[roomKeyOf(o)]" link class="room-balance-link" @click="openRoomBalance(o)">
                房间待结 {{ roomUnsettledCounts[roomKeyOf(o)] }} 单 · ¥ {{ moneyText(roomBalances[roomKeyOf(o)].unsettledAmount) }}
              </el-button>
            </div>
            <div class="order-actions">
              <el-button class="detail-button" @click="openDrawer(o)">详情</el-button>
              <el-button v-if="isUnsettled(o) && userStore.hasPermission('pos:view')" class="cash-button" :loading="statusPending[orderKeyOf(o)]" @click="settleCash(o).catch(() => {})">现金结算</el-button>
              <el-button v-if="canAct(o)" class="primary-action" :loading="statusPending[orderKeyOf(o)]" type="primary" @click="updateStatus(o)">{{ actionTextOf(o) }}</el-button>
            </div>
          </div>
        </article>
      </div>
    </div>

    <footer v-if="workTotal > 0" class="list-footer">
      <span>每 10 秒自动同步</span>
      <el-pagination v-model:current-page="workPage" :page-size="24" :total="workTotal" layout="total, prev, pager, next" :pager-count="5" />
    </footer>

    <el-drawer v-model="drawerVisible" title="订单详情" direction="rtl" size="min(720px, 100vw)">
      <div v-loading="drawerLoading">
        <template v-if="orderDetail">
          <div class="detail-room-header">
            <div><span class="room-caption">房间 / 桌号</span><h3>{{ roomKeyOf(orderDetail) || '—' }}</h3></div>
            <el-tag :type="statusTagType(orderDetail.status)">{{ statusText(orderDetail.status) }}</el-tag>
          </div>
          <p class="detail-order-number">{{ orderDetail.orderNo || orderDetail.orderNumber || orderDetail.orderId || '—' }}</p>
          <div class="detail-amounts">
            <div><span>订单金额</span><strong>¥ {{ moneyText(orderDetail.amountTotal) }}</strong></div>
            <div><span>实付金额</span><strong>¥ {{ moneyText(orderDetail.amountPaid) }}</strong></div>
            <div><span>退款金额</span><strong>¥ {{ moneyText(orderDetail.amountRefunded) }}</strong></div>
          </div>
          <div v-if="isUnsettled(orderDetail) || (!summaryError && roomUnsettledCounts[roomKeyOf(orderDetail)])" class="detail-balance order-balance">
            <span v-if="isUnsettled(orderDetail)" class="unsettled-label">本单挂账未结</span>
            <el-button v-if="!summaryError && roomUnsettledCounts[roomKeyOf(orderDetail)]" link class="room-balance-link" @click="openRoomBalance(orderDetail)">房间待结 {{ roomUnsettledCounts[roomKeyOf(orderDetail)] }} 单 · ¥ {{ moneyText(roomBalances[roomKeyOf(orderDetail)].unsettledAmount) }} · 查看账款</el-button>
          </div>

          <section class="detail-section">
            <h4>商品明细 <span>{{ (orderDetail.items || []).length }} 种</span></h4>
            <div v-for="(item, idx) in orderDetail.items || []" :key="item.id || idx" class="detail-product">
              <div class="detail-product-copy">
                <strong>{{ item.name }}</strong>
                <p v-if="specsText(item) !== '—'">规格：{{ specsText(item) }}</p>
                <p v-if="selectedAttrsText(item) !== '—'">已选属性：{{ selectedAttrsText(item) }}</p>
                <span v-if="item.skuCode" class="sku-code">SKU：{{ item.skuCode }}</span>
              </div>
              <strong class="detail-quantity">× {{ item.qty }}</strong>
            </div>
            <p v-if="!orderDetail.items?.length" class="text-sm text-slate-400">暂无商品明细</p>
          </section>
          <section class="detail-section">
            <h4>订单时间</h4>
            <dl class="detail-times">
              <div><dt>创建时间</dt><dd>{{ formatTime(orderDetail.createdAt) }}</dd></div>
              <div v-if="orderDetail.paidAt"><dt>支付时间</dt><dd>{{ formatTime(orderDetail.paidAt) }}</dd></div>
              <div v-if="orderDetail.canceledAt"><dt>取消时间</dt><dd>{{ formatTime(orderDetail.canceledAt) }}</dd></div>
              <div v-if="orderDetail.completedAt"><dt>完成时间</dt><dd>{{ formatTime(orderDetail.completedAt) }}</dd></div>
            </dl>
          </section>
        </template>
        <p v-else class="text-slate-400">{{ drawerLoading ? '正在加载订单…' : '暂无数据' }}</p>
      </div>
      <template #footer>
        <div class="drawer-actions">
          <el-button :loading="drawerLoading" @click="refreshDrawer">刷新详情</el-button>
          <div class="drawer-primary-actions">
            <el-button @click="drawerVisible = false">关闭</el-button>
            <el-button v-if="orderDetail && isUnsettled(orderDetail) && userStore.hasPermission('pos:view')" :loading="statusPending[orderKeyOf(orderDetail)]" @click="settleCash(orderDetail).catch(() => {})">现金结算</el-button>
            <el-button v-if="orderDetail && canAct(orderDetail)" :loading="statusPending[orderKeyOf(orderDetail)]" type="primary" @click="updateStatus(orderDetail)">{{ actionTextOf(orderDetail) }}</el-button>
          </div>
        </div>
      </template>
    </el-drawer>
    <RoomBalanceDialog v-model="balanceDialogVisible" :room-id="balanceRoomId" @settled="refreshAll" />
  </div>
</template>

<style scoped>
.order-workbench { display: flex; flex-direction: column; gap: 14px; color: #334155; }
.workbench-header, .header-tools, .filter-bar, .filter-fields, .filter-extras, .list-caption, .list-footer { display: flex; align-items: center; gap: 12px; }
.workbench-header, .filter-bar, .list-caption, .list-footer { justify-content: space-between; }
.workbench-header, .header-tools, .filter-bar, .filter-extras, .list-caption, .list-footer { flex-wrap: wrap; }
.header-tools :deep(.el-button + .el-button), .order-actions :deep(.el-button + .el-button), .drawer-actions :deep(.el-button + .el-button) { margin-left: 0; }
.sync-status { display: inline-flex; align-items: center; gap: 6px; color: #64748b; font-size: 12px; white-space: nowrap; }
.sync-dot { width: 6px; height: 6px; border-radius: 50%; background: #16a34a; }
.sync-dot-warning { background: #d97706; }
.new-order-notice { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; padding: 12px 16px; border: 1px solid #bfdbfe; border-radius: 10px; background: #eff6ff; color: #1d4ed8; font-size: 14px; }
.new-order-notice > span { display: flex; align-items: center; gap: 8px; }
.status-strip { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.status-entry { --status-color: #2563eb; padding: 12px 16px; border: 1px solid #e2e8f0; border-radius: 12px; background: #fff; text-align: left; cursor: pointer; transition: border-color .15s, background-color .15s; }
.status-entry:hover { border-color: #93c5fd; }
.status-entry.is-active { border-color: #2563eb; background: #eff6ff; box-shadow: 0 0 0 1px #2563eb; }
.status-entry:focus-visible { outline: 3px solid #93c5fd; outline-offset: 3px; }
.status-preparing { --status-color: #d97706; }
.status-delivering { --status-color: #7c3aed; }
.status-completed { --status-color: #16a34a; }
.status-entry-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.status-entry-top > span { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; }
.status-dot { width: 7px; height: 7px; flex-shrink: 0; border-radius: 50%; background: var(--status-color); }
.status-entry-top strong { color: #0f172a; font-size: 26px; line-height: 1; font-variant-numeric: tabular-nums; }
.filter-bar { gap: 14px; padding: 10px 16px; border: 1px solid #e2e8f0; border-radius: 12px; background: #fff; }
.filter-fields { flex: 1; min-width: 0; }
.keyword-input { max-width: 320px; min-width: 180px; }
.room-select { width: 150px; flex-shrink: 0; }
.filter-extras { gap: 14px; }
.overtime-toggle { margin-right: 0; }
.overtime-summary { display: flex; align-items: center; gap: 5px; color: #b91c1c; font-size: 12px; white-space: nowrap; }
.threshold-note { margin-left: 3px; color: #64748b; }
.list-caption { gap: 6px 12px; }
.list-caption h3 { color: #1e293b; font-size: 15px; font-weight: 600; }
.list-caption h3 span { margin-left: 8px; color: #64748b; font-size: 13px; font-weight: 400; }
.list-caption > span, .list-footer > span { color: #64748b; font-size: 12px; }
.order-list { min-height: 220px; }
.order-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 310px), 1fr)); gap: 16px; }
.order-card { display: flex; flex-direction: column; min-width: 0; min-height: 300px; padding: 16px; border: 1px solid #e2e8f0; border-top: 3px solid #e2e8f0; border-radius: 12px; background: #fff; transition: box-shadow .15s; }
.order-card:hover { box-shadow: 0 4px 16px #0f172a08; }
.order-card-overdue { border-color: #fecaca; border-top-color: #dc2626; }
.order-card-header, .order-meta, .product-line, .order-timing, .order-actions { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.order-card-header { align-items: flex-start; }
.room-heading { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.room-caption { color: #64748b; font-size: 12px; }
.room-heading h3 { overflow: hidden; color: #0f172a; font-size: 26px; font-weight: 700; line-height: 1.3; text-overflow: ellipsis; white-space: nowrap; }
.order-meta { margin-top: 8px; color: #64748b; font-size: 11px; }
.order-meta > span:last-child { flex-shrink: 0; }
.order-number { overflow: hidden; font-family: ui-monospace, monospace; text-overflow: ellipsis; white-space: nowrap; }
.order-products { flex: 1; min-height: 90px; padding: 10px 0; }
.product-line { margin-bottom: 5px; font-size: 14px; }
.product-line > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.product-line > strong { flex-shrink: 0; color: #475569; font-size: 13px; }
.more-products { font-size: 12px; color: #64748b; }
.order-card-bottom { margin-top: auto; }
.order-timing { gap: 6px; font-size: 12px; }
.wait-indicator, .completed-indicator { display: inline-flex; align-items: center; flex-wrap: wrap; gap: 4px; color: #64748b; }
.wait-warning { color: #b45309; }
.wait-danger { color: #b91c1c; }
.wait-danger strong { font-size: 16px; }
.completed-indicator { color: #15803d; }
.order-amount { flex-shrink: 0; color: #475569; font-weight: 600; font-variant-numeric: tabular-nums; }
.order-balance { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; margin-top: 10px; padding: 8px 10px; border-radius: 6px; background: #fffbeb; font-size: 12px; }
.unsettled-label { color: #92400e; }
.room-balance-link { max-width: 100%; color: #92400e; font-size: 12px; white-space: normal; text-align: left; }
.room-balance-link :deep(span) { overflow-wrap: anywhere; }
.order-actions { gap: 8px; margin-top: 12px; padding-top: 12px; border-top: 1px solid #f1f5f9; }
.order-actions :deep(.el-button) { height: 40px; padding: 0 12px; }
.order-actions .primary-action { flex: 1; font-weight: 600; }
.order-actions .cash-button { color: #64748b; }
.empty-orders { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 50px 20px; border: 1px dashed #cbd5e1; border-radius: 12px; background: #fff; color: #94a3b8; text-align: center; }
.empty-orders h3 { margin-top: 6px; color: #475569; font-size: 16px; font-weight: 600; }
.empty-orders p { margin-bottom: 6px; font-size: 13px; }
.list-footer { padding-top: 4px; }
.list-footer :deep(.el-pagination) { flex-wrap: wrap; row-gap: 8px; }
.detail-room-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.detail-room-header h3 { color: #0f172a; font-size: 30px; font-weight: 700; overflow-wrap: anywhere; }
.detail-order-number { margin-top: 8px; color: #64748b; font-size: 12px; font-family: ui-monospace, monospace; overflow-wrap: anywhere; }
.detail-amounts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 22px; padding: 16px; border-radius: 10px; background: #f8fafc; }
.detail-amounts > div { display: flex; flex-direction: column; gap: 6px; }
.detail-amounts span { color: #64748b; font-size: 12px; }
.detail-amounts strong { color: #1e293b; font-size: 18px; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.detail-balance { margin-top: 16px; }
.detail-section { margin-top: 28px; }
.detail-section h4 { margin-bottom: 12px; color: #1e293b; font-size: 15px; font-weight: 600; }
.detail-section h4 span { margin-left: 8px; color: #64748b; font-size: 12px; font-weight: 400; }
.detail-product { display: flex; justify-content: space-between; gap: 16px; padding: 14px 0; border-bottom: 1px solid #f1f5f9; }
.detail-product-copy { min-width: 0; overflow-wrap: anywhere; }
.detail-product-copy > strong { color: #334155; font-size: 14px; }
.detail-product-copy p { margin-top: 5px; color: #64748b; font-size: 12px; }
.sku-code { display: block; margin-top: 6px; color: #94a3b8; font-size: 11px; }
.detail-quantity { flex-shrink: 0; color: #334155; font-size: 16px; }
.detail-times > div { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px 16px; margin-bottom: 12px; font-size: 13px; }
.detail-times dt { color: #64748b; }
.detail-times dd { color: #475569; }
.drawer-actions, .drawer-primary-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.drawer-actions { justify-content: space-between; }
@media (max-width: 1100px) {
  .header-tools { gap: 8px; }
  .sync-status { flex-basis: 100%; justify-content: flex-end; }
  .filter-fields { flex-basis: 100%; }
}
@media (max-width: 760px) {
  .status-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .header-tools { width: 100%; }
  .sync-status { flex-basis: auto; justify-content: flex-start; margin-right: auto; }
  .filter-fields { flex-wrap: wrap; }
  .keyword-input { max-width: none; min-width: 0; flex-basis: 100%; }
  .room-select { width: 100%; }
  .threshold-note { display: none; }
  .detail-amounts { gap: 8px; padding: 12px; }
  .detail-amounts strong { font-size: 15px; }
  .drawer-primary-actions { margin-left: auto; }
}
</style>
