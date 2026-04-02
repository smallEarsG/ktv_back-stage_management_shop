<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { Bell, BellFilled, Refresh, Search } from '@element-plus/icons-vue'
import request from '@/lib/request'
import { ElMessage, ElMessageBox } from 'element-plus'
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'

dayjs.extend(customParseFormat)

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

const activeTab = ref(TAB_PENDING)
const loading = ref(false)
const orders = ref([])
const rooms = ref([])
const roomsLoading = ref(false)
const roomFilter = ref('')
const keyword = ref('')
const soundEnabled = ref(false)

const drawerVisible = ref(false)
const drawerLoading = ref(false)
const drawerOrderId = ref(null)
const orderDetail = ref(null)
const settleLoading = ref(false)
const settleLoadingByKey = reactive({})
const settleRoomLoadingByKey = reactive({})

let pollTimer = null
const seenPendingIds = reactive(new Set())

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

const nextStatusOf = (row) => {
  const v = Number(row?.status)
  if (v === TAB_PENDING) return TAB_PREPARING
  if (v === TAB_PREPARING) return TAB_DELIVERING
  if (v === TAB_DELIVERING) return TAB_COMPLETED
  return null
}

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

const applySort = (list) => {
  const timeNum = (row) => {
    const d = parseOrderTime(row?.createdAt)
    return d.isValid() ? d.valueOf() : 0
  }
  return list.slice().sort((a, b) => timeNum(a) - timeNum(b))
}

const fetchOrders = async () => {
  loading.value = true
  try {
    const res = await request.get('/orders', { params: { page: 1, pageSize: 2000 } })
    const list = (res.list || []).map(o => ({
      ...o,
      status: normalizeStatusCode(o.status) ?? o.status,
      payStatus: o?.payStatus ?? o?.pay_status
    }))
    orders.value = list
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

const filteredOrders = computed(() => {
  const room = String(roomFilter.value || '').trim().toLowerCase()
  const kw = String(keyword.value || '').trim().toLowerCase()
  const target = activeTab.value
  let list = orders.value || []
  list = list.filter(o => Number(o?.status) === Number(target))
  if (room) {
    list = list.filter(o => String(o?.roomId ?? o?.roomName ?? '').toLowerCase().includes(room))
  }
  if (kw) {
    list = list.filter(o => {
      const hay = `${o?.orderNo ?? o?.orderNumber ?? ''} ${o?.roomId ?? o?.roomName ?? ''} ${o?.itemsSummary ?? ''}`.toLowerCase()
      return hay.includes(kw)
    })
  }
  return applySort(list)
})

const roomKeyOf = (row) => {
  const v = row?.roomId ?? row?.roomName
  return v === undefined || v === null ? '' : String(v)
}

const roomUnsettledCounts = computed(() => {
  const map = {}
  for (const o of filteredOrders.value || []) {
    if (!isUnsettled(o)) continue
    const rk = roomKeyOf(o)
    if (!rk) continue
    map[rk] = (map[rk] || 0) + 1
  }
  return map
})

const counts = computed(() => {
  const room = String(roomFilter.value || '').trim().toLowerCase()
  const kw = String(keyword.value || '').trim().toLowerCase()
  let list = orders.value || []
  if (room) {
    list = list.filter(o => String(o?.roomId ?? o?.roomName ?? '').toLowerCase().includes(room))
  }
  if (kw) {
    list = list.filter(o => {
      const hay = `${o?.orderNo ?? o?.orderNumber ?? ''} ${o?.roomId ?? o?.roomName ?? ''} ${o?.itemsSummary ?? ''}`.toLowerCase()
      return hay.includes(kw)
    })
  }
  const counter = { 20: 0, 30: 0, 40: 0, 50: 0, overtime: 0 }
  for (const o of list) {
    const s = Number(o?.status)
    if (s === 20) counter[20] += 1
    if (s === 30) counter[30] += 1
    if (s === 40) counter[40] += 1
    if (s === 50) counter[50] += 1
    const mins = waitMinutes(o)
    if (mins !== null && mins >= 20) counter.overtime += 1
  }
  return counter
})

const beep = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
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
      ctx.close()
    }, 160)
  } catch {}
}

const checkNewPending = () => {
  const pending = (orders.value || []).filter(o => Number(o?.status) === TAB_PENDING)
  let hasNew = false
  for (const o of pending) {
    const id = o?.id ?? o?.orderId ?? o?.orderNo ?? o?.orderNumber
    if (!id) continue
    if (!seenPendingIds.has(String(id))) {
      hasNew = true
      seenPendingIds.add(String(id))
    }
  }
  if (hasNew && soundEnabled.value) beep()
}

const startPolling = () => {
  if (pollTimer) return
  pollTimer = setInterval(async () => {
    await fetchOrders()
    checkNewPending()
  }, 10000)
}

const stopPolling = () => {
  if (!pollTimer) return
  clearInterval(pollTimer)
  pollTimer = null
}

watch(soundEnabled, async (val) => {
  if (val) {
    await fetchOrders()
    checkNewPending()
    startPolling()
  } else {
    stopPolling()
  }
})

const openDrawer = async (row) => {
  const key = orderKeyOf(row)
  if (!key) return
  drawerVisible.value = true
  drawerOrderId.value = key
  drawerLoading.value = true
  orderDetail.value = null
  try {
    const res = await request.get(`/orders/${key}`)
    orderDetail.value = res
  } catch (e) {
    console.error(e)
    ElMessage.error('获取订单详情失败')
    drawerVisible.value = false
  } finally {
    drawerLoading.value = false
  }
}

const refreshDrawer = async () => {
  if (!drawerOrderId.value) return
  drawerLoading.value = true
  try {
    const res = await request.get(`/orders/${drawerOrderId.value}`)
    orderDetail.value = res
  } catch (e) {
    console.error(e)
  } finally {
    drawerLoading.value = false
  }
}

const orderKeyOf = (rowOrDetail) => {
  const v = rowOrDetail?.orderId ?? rowOrDetail?.id ?? rowOrDetail?.orderNo ?? rowOrDetail?.orderNumber
  return v === undefined || v === null ? '' : String(v)
}

const orderNumericIdOf = (rowOrDetail) => {
  const v = rowOrDetail?.orderId ?? rowOrDetail?.id
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const payStatusValueOf = (rowOrDetail) => {
  const direct = rowOrDetail?.payStatus ?? rowOrDetail?.pay_status
  if (direct !== undefined && direct !== null && direct !== '') return Number(direct)
  return null
}

const isUnsettled = (rowOrDetail) => payStatusValueOf(rowOrDetail) === 0

const settleLoadingOfCard = (row) => {
  const key = orderKeyOf(row)
  if (!key) return false
  return Boolean(settleLoadingByKey[key])
}

const currentOrderId = () => {
  const d = orderDetail.value || {}
  return orderNumericIdOf(d)
}

const settleOrder = async (orderId) => {
  const id = Number.isFinite(Number(orderId)) ? Number(orderId) : currentOrderId()
  if (!id) {
    ElMessage.error('订单ID无效，无法结算')
    return
  }
  let payMethod = null
  try {
    await ElMessageBox.confirm('请选择挂账结算方式', '挂账结算', {
      confirmButtonText: '扫码支付',
      cancelButtonText: '现金',
      distinguishCancelAndClose: true,
      type: 'warning'
    })
    payMethod = 1
  } catch (e) {
    if (e === 'cancel') payMethod = 2
    else return
  }
  settleLoading.value = true
  try {
    await request.post(`/cashier/orders/${id}/settle`, { payMethod })
    ElMessage.success('结算成功')
    await fetchOrders()
    if (drawerVisible.value && currentOrderId() === id) await refreshDrawer()
  } catch (e) {
    console.error(e)
  } finally {
    settleLoading.value = false
  }
}

const settleOrderFromCard = async (row) => {
  const key = orderKeyOf(row)
  if (!key) {
    ElMessage.error('订单ID无效，无法结算')
    return
  }
  settleLoadingByKey[key] = true
  try {
    let numericId = orderNumericIdOf(row)
    if (!numericId) {
      const res = await request.get(`/orders/${key}`)
      numericId = orderNumericIdOf(res)
    }
    if (!numericId) {
      ElMessage.error('订单不可结算或不存在')
      return
    }
    await settleOrder(numericId)
  } finally {
    settleLoadingByKey[key] = false
  }
}

const settleRoomFromCard = async (row) => {
  const rk = roomKeyOf(row)
  if (!rk) {
    ElMessage.error('房间号无效，无法结算')
    return
  }
  settleRoomLoadingByKey[rk] = true
  let payMethod = null
  try {
    await ElMessageBox.confirm('请选择挂账结算方式', '本房间挂账结算', {
      confirmButtonText: '扫码支付',
      cancelButtonText: '现金',
      distinguishCancelAndClose: true,
      type: 'warning'
    })
    payMethod = 1
  } catch (e) {
    if (e === 'cancel') payMethod = 2
    else {
      settleRoomLoadingByKey[rk] = false
      return
    }
  }

  try {
    const unsettled = (orders.value || []).filter(o => roomKeyOf(o) === rk && isUnsettled(o))
    const ids = unsettled.map(o => orderNumericIdOf(o)).filter(Boolean)
    const body = ids.length === unsettled.length && ids.length > 0 ? { payMethod, orderIds: ids } : { payMethod }
    // await request.post(`/cashier/rooms/${encodeURIComponent(rk)}/settle`, body)
    ElMessage.success('结算成功')
    await fetchOrders()
    if (drawerVisible.value) await refreshDrawer()
  } catch (e) {
    console.error(e)
  } finally {
    settleRoomLoadingByKey[rk] = false
  }
}

const updateStatus = async (rowOrDetail) => {
  const current = Number(rowOrDetail?.status)
  const next = nextStatusOf({ status: current })
  if (!next) return
  const id = rowOrDetail?.id ?? rowOrDetail?.orderId ?? rowOrDetail?.orderNo ?? rowOrDetail?.orderNumber
  if (!id) return
  try {
    await request.patch(`/orders/${id}/status`, { status: next })
    ElMessage.success('操作成功')
    await fetchOrders()
    if (drawerVisible.value) await refreshDrawer()
  } catch (e) {
    console.error(e)
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
  await Promise.all([fetchOrders(), refreshRooms()])
  checkNewPending()
})

onBeforeUnmount(() => {
  stopPolling()
})
</script>

<template>
  <div class="space-y-4">
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
        <el-button :icon="Refresh" @click="fetchOrders">刷新</el-button>
        <el-button :icon="soundEnabled ? BellFilled : Bell" :type="soundEnabled ? 'primary' : 'default'" @click="soundEnabled = !soundEnabled">
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

    <div v-loading="loading">
      <div v-if="filteredOrders.length === 0" class="p-10 text-center bg-white rounded border text-slate-400">暂无任务</div>
      <div v-else class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <el-card v-for="o in filteredOrders" :key="o.id" shadow="hover" class="h-60 border">
          <div class="flex flex-col h-full">
            <div class="flex gap-3 justify-between items-start">
              <div class="min-w-0">
                <div class="flex gap-2 items-center">
                  <div class="text-xl font-bold truncate text-slate-800">
                    {{ o.roomId || o.roomName || '—' }}
                  </div>
                  <el-tag :type="statusTagType(o.status)" effect="plain">{{ statusText(o.status) }}</el-tag>
                  <el-tag v-if="isUnsettled(o)" type="warning" effect="plain">挂账未结</el-tag>
                  <el-tag v-if="roomUnsettledCounts[roomKeyOf(o)] > 1" type="warning" effect="plain">
                    待结{{ roomUnsettledCounts[roomKeyOf(o)] }}单
                  </el-tag>
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
              <el-button
                v-if="roomUnsettledCounts[roomKeyOf(o)] > 1 && isUnsettled(o)"
                :loading="settleRoomLoadingByKey[roomKeyOf(o)]"
                type="warning"
                size="small"
                @click="settleRoomFromCard(o)"
              >
                本房间结算
              </el-button>
              <el-button 
                v-if="isUnsettled(o)"
                :loading="settleLoadingOfCard(o)"
                type="warning"
                size="small"
                @click="settleOrderFromCard(o)"
              >
                挂账结算
              </el-button>
              <el-button size="small" @click="openDrawer(o)">详情</el-button>
              <el-button v-if="canAct(o)" type="primary" size="small" @click="updateStatus(o)">{{ actionTextOf(o) }}</el-button>
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
            <el-button
              v-if="Number(orderDetail?.payStatus) === 0"
              :loading="settleLoading"
              type="warning"
              @click="settleOrder"
            >
              挂账结算
            </el-button>
            <el-button @click="drawerVisible = false">关闭</el-button>
            <el-button v-if="orderDetail && canAct(orderDetail)" type="primary" @click="updateStatus(orderDetail)">{{ actionTextOf(orderDetail) }}</el-button>
          </div>
        </div>
      </template>
    </el-drawer>
  </div>
</template>
