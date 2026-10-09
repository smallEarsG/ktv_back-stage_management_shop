<script setup>
import { ref, watch, onMounted, onBeforeUnmount, computed, reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CashierPaymentDialog from '@/components/CashierPaymentDialog.vue'
import { Search, Filter } from '@element-plus/icons-vue'
import TimeRangePicker from '@/components/TimeRangePicker.vue'
import request from '@/lib/request'
import { ElMessage, ElMessageBox } from 'element-plus'
import dayjs from 'dayjs'
import { dateRangeParams } from '@/lib/date-range'
import { useUserStore } from '@/stores/user'
import customParseFormat from 'dayjs/plugin/customParseFormat'

dayjs.extend(customParseFormat)

const activeStatus = ref('all')
const searchQuery = ref('')
const dateRange = ref([])
const loading = ref(false)
const rawOrders = ref([])
const currentPage = ref(1)
const pageSize = ref(10)
const showDetailDialog = ref(false)
const detailLoading = ref(false)
const orderDetail = ref(null)
const statusPending = reactive({})
const payStatusFilter = ref('all')
const route = useRoute()
const router = useRouter()
const payDialog = ref(false)
const payOrderId = ref(null)
const canResume = row => Number(row?.source) === 2 && Number(row?.payMethod) === 1 && Number(row?.status) === 10 && [0, 1].includes(Number(row?.payStatus)) && userStore.hasPermission('pos:view')
const resumePayment = row => { payOrderId.value = row.orderId || row.id; payDialog.value = true }

const statusOptions = [
  { value: 'all', label: '全部' },
  { value: 'credit_unsettled', label: '挂账未结' },
  { value: '10', label: '待支付' },
  { value: '20', label: '待处理' },
  { value: '30', label: '备货中' },
  { value: '40', label: '配送中' },
  { value: '50', label: '已完成' },
  { value: '91', label: '退款中' },
  { value: '92', label: '部分退款' },
  { value: '93', label: '已退款' },
  { value: '90', label: '已取消' }
]

const payStatusOptions = [
  { value: 'all', label: '支付全部' },
  { value: '0', label: '未支付' },
  { value: '1', label: '支付中' },
  { value: '2', label: '已支付' }
]

const statusLabel = (s) =>
  ({
    10: '待支付',
    20: '待处理',
    30: '备货中',
    40: '配送中',
    50: '已完成',
    90: '已取消',
    91: '退款中',
    92: '部分退款',
    93: '已退款'
  }[Number(s)] || String(s ?? ''))

const statusTagType = (s) => {
  const v = Number(s)
  if (v === 50) return 'success'
  if (v === 20) return 'danger'
  if (v === 91) return 'warning'
  if (v === 10) return 'info'
  if (v === 30) return 'warning'
  if (v === 40) return 'info'
  if (v === 90) return 'info'
  if (v === 92 || v === 93) return 'warning'
  return 'info'
}

const payStatusLabel = (row) => {
  const ps = payStatusCodeOf(row)
  if (ps === 2) return '已支付'
  if (Number(row?.status) === 90 || ps === -1) return '已取消'
  if (ps === 0) return '未支付'
  if (ps === 1) return '支付中'
  if (ps === 3) return '支付失败'
  return '—'
}

const payStatusTagType = (row) => {
  const v = payStatusLabel(row)
  if (v === '未支付' || v === '待支付' || v === '支付中') return 'warning'
  if (v === '支付失败') return 'danger'
  if (v === '支付中') return 'warning'
  if (v === '已支付') return 'success'
  if (v === '已取消') return 'info'
  return 'info'
}

const payStatusCodeOf = (row) => {
  const psRaw = row?.payStatus ?? row?.pay_status
  if (psRaw !== undefined && psRaw !== null && psRaw !== '') {
    const ps = Number(psRaw)
    if (Number.isFinite(ps)) return ps
  }
  const s = Number(row?.status)
  if (s === 10) return 0
  if ([20, 30, 40, 50, 91, 92, 93].includes(s)) return 2
  if (s === 90) return -1
  return null
}

const payMethodCodeOf = (row) => {
  const pmRaw = row?.payMethod ?? row?.pay_method
  const pm = Number(pmRaw)
  return Number.isFinite(pm) ? pm : null
}

const isCreditUnsettled = (row) => {
  const pm = payMethodCodeOf(row)
  const ps = payStatusCodeOf(row)
  return pm === 3 && (ps === 0 || ps === 1)
}

const parseOrderItems = (row) => {
  const txt = String(row?.itemsSummary || '').trim()
  if (!txt) return []
  return txt.split(',').map(s => s.trim()).filter(Boolean)
}

const itemSummaryText = (row) => {
  const items = parseOrderItems(row)
  if (!items.length) return '—'
  if (items.length === 1) return items[0]
  return `${items[0]} +${items.length - 1}件商品`
}

const createdAtText = (row) => {
  const d = parseOrderTime(row?.createdAt)
  if (!d.isValid()) return row?.createdAt ? String(row.createdAt) : ''
  return d.format('YYYY-MM-DD HH:mm:ss')
}

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
  return entries
    .map(([k, v]) => `${k}:${Array.isArray(v) ? v.join('/') : v}`)
    .join('，')
}

const isWaitingStatus = (status) => [10, 20, 30, 40].includes(Number(status))

const waitMinutes = (row) => {
  if (!isWaitingStatus(row?.status)) return null
  const d = parseOrderTime(row?.createdAt)
  if (!d.isValid()) return null
  const mins = dayjs().diff(d, 'minute')
  return mins < 0 ? 0 : mins
}

const waitTagType = (row) => {
  const mins = waitMinutes(row)
  if (mins === null) return 'info'
  if (mins >= 20) return 'danger'
  if (mins >= 10) return 'warning'
  return 'info'
}

const totalCount = ref(0)
const pagedOrders = computed(() => rawOrders.value)
const userStore = useUserStore()
let requestSequence = 0

const fetchOrders = async () => {
  const sequence = ++requestSequence
  loading.value = true
  try {
    const res = await request.get('/orders', { params: {
      page: currentPage.value, pageSize: pageSize.value, status: activeStatus.value,
      keyword: searchQuery.value || undefined, payStatus: payStatusFilter.value, ...dateRangeParams(dateRange.value)
    } })
    if (sequence !== requestSequence) return
    rawOrders.value = res.list || []
    totalCount.value = Number(res.total || 0)
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

const handleDateRangeChange = (range) => {
  dateRange.value = range
}

const handleStatusChange = async (row, nextStatus) => {
  if (statusPending[row.id]) return
  statusPending[row.id] = true
  try {
    await request.patch(`/orders/${row.id}/status`, { status: nextStatus })
    row.status = nextStatus
    ElMessage.success('状态更新成功')
    await fetchOrders()
  } catch (e) {
    console.error(e)
  } finally {
    statusPending[row.id] = false
  }
}

const handleFilter = () => { currentPage.value = 1; fetchOrders() }
let filterTimer
watch([activeStatus, searchQuery, dateRange, payStatusFilter], () => {
  currentPage.value = 1
  clearTimeout(filterTimer)
  filterTimer = setTimeout(fetchOrders, 250)
})
watch([currentPage, pageSize], fetchOrders)

const cancelOrder = async (row) => {
  await ElMessageBox.confirm('确认取消未付款订单并释放库存？', '取消订单', { type: 'warning' })
  return handleStatusChange(row, 90)
}

const settleCash = async (row) => {
  if (statusPending[row.id]) return
  await ElMessageBox.confirm('请确认已收到此订单的全部现金，再登记结算。', '确认现金到账', { type: 'warning' })
  statusPending[row.id] = true
  try {
    await request.post(`/cashier/orders/${row.id}/settle`, { payMethod: 2 })
    ElMessage.success('现金结算成功'); await fetchOrders()
  } finally { statusPending[row.id] = false }
}

const applyRouteFilters = () => {
  if (route.query?.status !== undefined) {
    activeStatus.value = String(route.query.status)
  }
  if (route.query?.payStatus !== undefined) {
    payStatusFilter.value = String(route.query.payStatus)
  }
}

const notSupported = () => {
  ElMessage.warning('该操作后端暂未开放接口')
}

let detailSequence = 0
const openOrderDetail = async (row) => {
  const sequence = ++detailSequence
  showDetailDialog.value = true
  detailLoading.value = true
  orderDetail.value = null
  try {
    const res = await request.get(`/orders/${row.id}`)
    if (sequence !== detailSequence) return
    orderDetail.value = res
  } catch (e) {
    if (sequence !== detailSequence) return
    console.error(e)
    ElMessage.error('获取订单详情失败')
    showDetailDialog.value = false
  } finally {
    if (sequence === detailSequence) detailLoading.value = false
  }
}

const currentOrderId = () => {
  const d = orderDetail.value || {}
  const v = d.orderId ?? d.id
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const refreshOrderDetail = async () => {
  const id = currentOrderId()
  if (!id) return
  detailLoading.value = true
  try {
    const res = await request.get(`/orders/${id}`)
    orderDetail.value = res
  } catch (e) {
    console.error(e)
  } finally {
    detailLoading.value = false
  }
}

onMounted(() => {
  applyRouteFilters()
  fetchOrders()
})

watch(
  () => route.query,
  () => {
    applyRouteFilters()
  }
)

watch(() => route.query.orderId, id => {
  if (/^[1-9]\d*$/.test(String(id || ''))) openOrderDetail({ id })
}, { immediate: true })
onBeforeUnmount(() => { detailSequence++ })
</script>

<template>
  <div>
    <div class="flex flex-col gap-4 justify-between items-start mb-6 xl:flex-row xl:items-center">
      <h2 class="text-2xl font-bold text-slate-800">订单管理</h2>
      <div class="flex flex-wrap gap-2 items-center">
        <TimeRangePicker v-model="dateRange" allow-all :default-shortcut="route.query.dateScope === 'all' ? 'all' : 'today'" @change="handleDateRangeChange" />
        <el-select v-model="payStatusFilter" class="w-36" placeholder="支付状态">
          <el-option v-for="option in payStatusOptions" :key="option.value" :label="option.label" :value="option.value" />
        </el-select>
        <el-input
          v-model="searchQuery"
          placeholder="搜索房间号/订单号/商品"
          class="w-64"
          :prefix-icon="Search"
          @keyup.enter="handleFilter"
        />
        <el-button :icon="Filter" @click="handleFilter">筛选</el-button>
      </div>
    </div>

    <el-radio-group v-model="activeStatus" class="mb-4 flex flex-wrap gap-y-2">
      <el-radio-button v-for="opt in statusOptions" :key="opt.value" :label="opt.value">
        <span :class="opt.value === '20' ? 'text-red-600 font-bold' : opt.value === '91' || opt.value === 'credit_unsettled' ? 'text-orange-600 font-bold' : ''">{{ opt.label }}</span>
      </el-radio-button>
    </el-radio-group>

    <el-table :data="pagedOrders" style="width: 100%" border stripe v-loading="loading">
      <el-table-column prop="orderNumber" label="订单号" width="120" />
      <el-table-column prop="roomName" label="房间/座位" width="120">
        <template #default="{ row }">
          <el-tag effect="dark" size="large">{{ row.roomName }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="商品摘要" min-width="220">
        <template #default="{ row }">
          <div class="flex gap-2 items-center">
            <span class="truncate text-slate-700">{{ itemSummaryText(row) }}</span>
            <el-popover v-if="parseOrderItems(row).length > 1" placement="bottom-start" trigger="click" width="260">
              <div class="space-y-1 text-sm">
                <div v-for="(it, i) in parseOrderItems(row)" :key="i" class="text-slate-700">{{ it }}</div>
              </div>
              <template #reference>
                <el-button link type="primary" size="small">展开</el-button>
              </template>
            </el-popover>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="amount" label="金额" width="120">
        <template #default="{ row }">
          <span class="font-bold text-red-500">¥ {{ Number(row.amount || 0).toFixed(2) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="支付状态" width="120" align="center">
        <template #default="{ row }">
          <el-tag :type="payStatusTagType(row)">{{ payStatusLabel(row) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="订单状态" width="120" align="center">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.status)">{{ statusLabel(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="等待时长" width="140" align="center">
        <template #default="{ row }">
          <template v-if="waitMinutes(row) !== null">
            <el-tag :type="waitTagType(row)">已等待 {{ waitMinutes(row) }} 分钟</el-tag>
          </template>
          <template v-else>—</template>
        </template>
      </el-table-column>
      <el-table-column label="下单时间" width="180">
        <template #default="{ row }">{{ createdAtText(row) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="280" fixed="right">
        <template #default="{ row }">
          <el-button v-if="isCreditUnsettled(row) && userStore.hasPermission('pos:view')" size="small" type="warning" :loading="statusPending[row.id]" @click="settleCash(row).catch(() => {})">现金结算</el-button>
          <el-button v-if="canResume(row)" size="small" @click="resumePayment(row)">继续支付 / 查询</el-button>
          <template v-if="Number(row.status) === 10">
            <el-button type="danger" size="small" :loading="statusPending[row.id]" @click="cancelOrder(row).catch(() => {})">取消订单</el-button>
          </template>
          <template v-else-if="Number(row.status) === 20">
            <el-button type="primary" size="small" :loading="statusPending[row.id]" @click="handleStatusChange(row, 30)">接单</el-button>
            <el-button type="danger" size="small" :disabled="!isCreditUnsettled(row)" :loading="statusPending[row.id]" @click="cancelOrder(row).catch(() => {})">取消</el-button>
          </template>
          <template v-else-if="Number(row.status) === 30">
            <el-button type="primary" size="small" :loading="statusPending[row.id]" @click="handleStatusChange(row, 40)">开始配送</el-button>
          </template>
          <template v-else-if="Number(row.status) === 40">
            <el-button type="success" size="small" :loading="statusPending[row.id]" @click="handleStatusChange(row, 50)">完成</el-button>
          </template>
          <template v-else-if="Number(row.status) === 50">
            <el-button link type="primary" size="small" @click="openOrderDetail(row)">详情</el-button>
          </template>
          <template v-else>
            <el-button link type="primary" size="small" @click="openOrderDetail(row)">详情</el-button>
          </template>
        </template>
      </el-table-column>
    </el-table>

    <div class="flex justify-end mt-4">
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :total="totalCount"
        layout="total, prev, pager, next"
        @current-change="() => {}"
      />
    </div>

    <el-dialog v-model="showDetailDialog" title="订单详情" width="900px">
      <div v-loading="detailLoading">
        <template v-if="orderDetail">
          <el-descriptions :column="3" border>
            <el-descriptions-item label="订单号">{{ orderDetail.orderNo || orderDetail.orderNumber || '—' }}</el-descriptions-item>
            <el-descriptions-item label="房间/桌号">{{ orderDetail.roomId || orderDetail.roomName || '—' }}</el-descriptions-item>
            <el-descriptions-item label="用户ID">{{ orderDetail.userId ?? '—' }}</el-descriptions-item>
            <el-descriptions-item label="支付状态">
              <el-tag :type="payStatusTagType({ status: orderDetail.status, payStatus: orderDetail.payStatus })">
                {{ payStatusLabel({ status: orderDetail.status, payStatus: orderDetail.payStatus }) }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="订单状态">
              <el-tag :type="statusTagType(orderDetail.status)">{{ statusLabel(orderDetail.status) }}</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="金额">¥ {{ Number(orderDetail.amountTotal || 0).toFixed(2) }}</el-descriptions-item>
            <el-descriptions-item label="实付金额">¥ {{ Number(orderDetail.amountPaid || 0).toFixed(2) }}</el-descriptions-item>
            <el-descriptions-item label="退款金额">¥ {{ Number(orderDetail.amountRefunded || 0).toFixed(2) }}</el-descriptions-item>
            <el-descriptions-item label="创建时间">{{ formatTime(orderDetail.createdAt) }}</el-descriptions-item>
            <el-descriptions-item label="支付时间">{{ formatTime(orderDetail.paidAt) }}</el-descriptions-item>
            <el-descriptions-item label="取消时间">{{ formatTime(orderDetail.canceledAt) }}</el-descriptions-item>
            <el-descriptions-item label="完成时间">{{ formatTime(orderDetail.completedAt) }}</el-descriptions-item>
          </el-descriptions>

          <div class="mt-4">
            <div class="mb-2 font-bold text-slate-800">商品明细</div>
            <el-table :data="orderDetail.items || []" border stripe size="small">
              <el-table-column prop="name" label="商品" min-width="180" />
              <el-table-column label="SKU" width="120">
                <template #default="{ row: it }">
                  <el-tag v-if="it.skuCode" size="small" effect="plain">{{ it.skuCode }}</el-tag>
                  <template v-else>—</template>
                </template>
              </el-table-column>
              <el-table-column label="规格" min-width="140">
                <template #default="{ row: it }">{{ specsText(it) }}</template>
              </el-table-column>
              <el-table-column label="已选属性" min-width="180" show-overflow-tooltip>
                <template #default="{ row: it }">{{ selectedAttrsText(it) }}</template>
              </el-table-column>
              <el-table-column prop="unitPrice" label="单价" width="110" align="right">
                <template #default="{ row: it }">¥ {{ Number(it.unitPrice || 0).toFixed(2) }}</template>
              </el-table-column>
              <el-table-column prop="qty" label="数量" width="80" align="right" />
              <el-table-column prop="lineAmount" label="小计" width="110" align="right">
                <template #default="{ row: it }">¥ {{ Number(it.lineAmount || 0).toFixed(2) }}</template>
              </el-table-column>
            </el-table>
          </div>
        </template>
        <template v-else>
          <div class="text-slate-400">暂无数据</div>
        </template>
      </div>
      <template #footer>
        <div class="flex justify-between items-center w-full">
          <el-button v-if="route.query.from === 'refunds'" @click="router.push({ name: 'Refunds' })">返回退款售后</el-button>
          <div v-else></div>
          <div class="flex gap-2">
            <el-button v-if="isCreditUnsettled(orderDetail) && userStore.hasPermission('pos:view')" type="warning" :loading="statusPending[orderDetail?.orderId]" @click="settleCash({ ...orderDetail, id: orderDetail.orderId }).then(() => openOrderDetail({ id: orderDetail.orderId })).catch(() => {})">现金结算</el-button>
            <el-button v-if="canResume(orderDetail)" @click="resumePayment(orderDetail)">继续支付 / 查询</el-button>
            <el-button type="primary" @click="showDetailDialog = false">关闭</el-button>
          </div>
        </div>
      </template>
    </el-dialog>
    <CashierPaymentDialog v-model="payDialog" :order-id="payOrderId" @confirmed="fetchOrders" />
  </div>
</template>
