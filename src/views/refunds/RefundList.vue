<script setup>
import { ref, reactive, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useUserStore } from '@/stores/user'
import TimeRangePicker from '@/components/TimeRangePicker.vue'
import request from '@/lib/request'
import { dateRangeParams } from '@/lib/date-range'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const returnDialog = ref(false), returnRow = ref(null), returnItems = ref([]), returnRecords = ref([]), receiving = ref(false), received = ref(false), returnRequest = ref('')
let pollTimer
const wechatEnabled = ref(false)
const dateRange = ref([])
const refunds = ref([])
const loading = ref(false)
const page = ref(1)
const total = ref(0)
const status = ref('')
const orderNumber = ref(String(route.query.orderNumber || ''))
const dialog = ref(false)
const saving = ref(false)
const pending = reactive({})
const form = reactive({ orderId: '', amount: 0.01, reason: '' })
const labels = { 0: '待处理', 1: '处理中', 2: '退款完成', 3: '失败/已拒绝', 4: '已关闭' }
const tags = { 0: 'warning', 1: 'warning', 2: 'success', 3: 'danger', 4: 'info' }
const openRelatedOrder = row => {
  if (!userStore.hasPermission('order:view')) { ElMessage.warning('您没有查看订单的权限，请联系店长'); return }
  if (!/^[1-9]\d*$/.test(String(row?.orderId || ''))) { ElMessage.warning('该退款单缺少关联订单，暂无法查看'); return }
  return router.push({ name: 'Orders', query: { orderId: String(row.orderId), dateScope: 'all', from: 'refunds' } })
}
let sequence = 0
const fetchRefunds = async () => {
  const current = ++sequence
  loading.value = true
  try {
    const res = await request.get('/refunds', { params: {
      page: page.value, pageSize: 20, status: status.value || undefined,
      orderNumber: orderNumber.value.trim() || undefined, ...dateRangeParams(dateRange.value)
    } })
    if (current !== sequence) return
    refunds.value = res.list || []; total.value = Number(res.total || 0)
  } finally { if (current === sequence) loading.value = false }
}
const filter = () => { page.value = 1; fetchRefunds() }
const submit = async () => {
  if (saving.value) return
  if (!form.orderId.trim() || !form.reason.trim() || !(form.amount > 0)) { ElMessage.warning('请填写订单号、退款金额和原因'); return }
  saving.value = true
  try { await request.post('/refunds', { ...form }); dialog.value = false; ElMessage.success('申请已记录'); await fetchRefunds() }
  finally { saving.value = false }
}
const audit = async (row, action) => {
  if (pending[row.id]) return
  const cash = row.channel === 'cash'
  const wallet = row.channel === 'wallet'
  const text = action === 'reject' ? '确认拒绝此退款申请？'
    : cash ? '请确认已经线下退还现金，再登记退款完成。系统不会自动支付现金。'
    : wallet ? '退款将按原扣款构成退回会员钱包的本金与赠金，确认继续？'
    : import.meta.env.VITE_DEMO_MODE === 'true' ? '本次仅在演示环境记录退款，不退回真实资金。确认继续？' : wechatEnabled.value ? '将向微信提交原路退款申请，只有渠道确认成功后才登记为完成。确认继续？' : '微信渠道尚未配置，暂不能执行退款。'
  if (action === 'approve' && !cash && !wallet && import.meta.env.VITE_DEMO_MODE !== 'true' && !wechatEnabled.value) { ElMessage.warning(text); return }
  await ElMessageBox.confirm(text, '退款确认', { type: 'warning' })
  pending[row.id] = true
  try { await request.post(`/refunds/${row.id}/audit`, { action, cashReturned: cash && action === 'approve' }); ElMessage.success('处理完成'); await fetchRefunds() }
  finally { pending[row.id] = false }
}
const queryWechat = async (row) => {
  if (pending[row.id]) return
  pending[row.id] = true
  try { await request.post(`/refunds/${row.id}/wechat-query`); await fetchRefunds() }
  finally { pending[row.id] = false }
}
const retryWechat = async row => {
  if (pending[row.id] || !wechatEnabled.value) return
  await ElMessageBox.confirm('沿用原退款单号查询并重试，金额仍以渠道结果为准。确认继续？', '重试原退款单', { type: 'warning' })
  pending[row.id] = true
  try { await request.post(`/refunds/${row.id}/wechat-retry`); await fetchRefunds() }
  finally { pending[row.id] = false }
}
const attributesText = raw => {
  try { const attrs = typeof raw === 'string' ? JSON.parse(raw) : raw; return Object.entries(attrs || {}).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join('/') : value}`).join(' / ') } catch { return '' }
}
const openReturns = async row => {
  const detail = await request.get(`/refunds/${row.id}/returns`)
  returnRow.value = row; returnItems.value = (detail.items || []).map(item => ({ ...item, quantity: 0 }))
  returnRecords.value = detail.records || []; received.value = false
  returnRequest.value = `return-${crypto.randomUUID()}`; returnDialog.value = true
}
const receiveReturns = async () => {
  if (receiving.value) return
  const items = returnItems.value.filter(item => item.quantity > 0).map(item => ({ orderItemId: item.orderItemId, quantity: item.quantity }))
  if (!received.value || !items.length) { ElMessage.warning('请选择实际收到的商品数量，并确认验收可入库'); return }
  receiving.value = true
  try {
    await request.post(`/refunds/${returnRow.value.id}/returns`, { received: true, requestNo: returnRequest.value, items })
    ElMessage.success('退货已入库，库存记录已关联退款单'); returnDialog.value = false; await fetchRefunds()
  } finally { receiving.value = false }
}
onMounted(async () => {
  const capabilities = await request.get('/payment/capabilities')
  wechatEnabled.value = Boolean(capabilities.wechat)
  await fetchRefunds()
  pollTimer = setInterval(() => { if (!loading.value && refunds.value.some(row => Number(row.status) === 1)) fetchRefunds().catch(() => {}) }, 15000)
})
onBeforeUnmount(() => { sequence++; clearInterval(pollTimer) })
</script>

<template>
  <div>
    <el-alert title="支持已完成订单的退款申请、现金退款登记及演示退款。微信退款待真实商户配置启用；金额退款不自动补库存，完成退款后可按实际验收数量登记关联退货入库。" type="info" :closable="false" show-icon class="mb-4" />
    <div class="flex flex-wrap justify-between items-center gap-4 mb-6">
      <h2 class="text-2xl font-bold text-slate-800">退款售后</h2>
      <TimeRangePicker v-model="dateRange" @change="filter" />
    </div>
    <el-card>
      <template #header>
        <div class="flex flex-wrap items-center gap-3">
          <el-input v-model="orderNumber" placeholder="完整订单号" clearable class="w-64" @keyup.enter="filter" />
          <el-select v-model="status" placeholder="全部状态" clearable class="w-40" @change="filter">
            <el-option v-for="(label, code) in labels" :key="code" :label="label" :value="code" />
          </el-select>
          <el-button @click="filter">查询</el-button>
          <el-button type="primary" @click="dialog = true">申请退款</el-button>
        </div>
      </template>
      <el-table :data="refunds" v-loading="loading">
        <el-table-column prop="refundNo" label="退款单号" min-width="210" />
        <el-table-column label="关联订单" min-width="240">
          <template #default="{ row }">
            <el-button v-if="row.orderId" link type="primary" class="related-order" @click="openRelatedOrder(row)">{{ row.orderNumber || `订单 ${row.orderId}` }}</el-button>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="金额" width="110"><template #default="{ row }">¥ {{ Number(row.amount || 0).toFixed(2) }}</template></el-table-column>
        <el-table-column label="渠道" width="90"><template #default="{ row }">{{ { cash: '现金', demo: '演示', wechat: '微信', wallet: '会员钱包' }[row.channel] || row.channel }}</template></el-table-column>
        <el-table-column prop="reason" label="原因" min-width="130" />
        <el-table-column label="渠道提示" min-width="240"><template #default="{ row }"><span :class="row.channelInfo?.channelStatus === 'ABNORMAL' ? 'text-red-600' : 'text-slate-500'">{{ row.channelInfo?.channelMessage || (Number(row.status) === 1 ? '系统会自动查询，暂未确认退款完成' : '—') }}</span></template></el-table-column>
        <el-table-column prop="createdAt" label="申请时间" min-width="170" />
        <el-table-column label="状态" width="125"><template #default="{ row }"><el-tag :type="tags[Number(row.status)] || 'info'">{{ labels[Number(row.status)] || '未知状态' }}</el-tag></template></el-table-column>
        <el-table-column label="操作" min-width="185"><template #default="{ row }">
          <template v-if="Number(row.status) === 0">
            <el-button size="small" type="success" :loading="pending[row.id]" @click="audit(row, 'approve').catch(() => {})">{{ row.channel === 'cash' ? '登记已退现金' : '同意退款' }}</el-button>
            <el-button size="small" type="danger" :disabled="pending[row.id]" @click="audit(row, 'reject').catch(() => {})">拒绝</el-button>
          </template>
          <template v-else-if="Number(row.status) === 1 && row.channel === 'wechat'">
            <el-button :loading="pending[row.id]" @click="queryWechat(row)">查询渠道状态</el-button>
            <el-button v-if="wechatEnabled && row.channelInfo?.channelStatus !== 'ABNORMAL'" :disabled="pending[row.id]" @click="retryWechat(row).catch(() => {})">重试原退款单</el-button>
          </template>
          <el-button v-else-if="Number(row.status) === 2" size="small" @click="openReturns(row)">退货记录/入库</el-button><span v-else class="text-slate-400">已处理</span>
        </template></el-table-column>
      </el-table>
      <el-pagination v-model:current-page="page" :total="total" :page-size="20" layout="total, prev, pager, next" @current-change="fetchRefunds" class="mt-4" />
    </el-card>
    <el-dialog v-model="returnDialog" title="关联退货入库" width="680px" :close-on-click-modal="!receiving" :show-close="!receiving">
      <el-alert title="仅登记实际收回且验收可入库的商品。只退款无需操作；不可再通过普通入库重复登记。" type="warning" :closable="false" />
      <p class="my-3 break-all">退款单：{{ returnRow?.refundNo }}</p>
      <el-table :data="returnItems">
        <el-table-column label="商品" min-width="170"><template #default="{ row }">{{ row.name }}<p class="text-sm text-slate-500">{{ attributesText(row.selectedAttrs) }}</p></template></el-table-column>
        <el-table-column prop="purchased" label="购买" width="70" /><el-table-column prop="returned" label="已退" width="70" />
        <el-table-column label="本次验收入库" width="180"><template #default="{ row }"><el-input-number v-model="row.quantity" :min="0" :max="row.remaining" :precision="0" :disabled="receiving || !userStore.hasPermission('warehouse:view') || !row.remaining" /></template></el-table-column>
      </el-table>
      <el-checkbox v-model="received" class="mt-3" :disabled="receiving">商品已实际收到并验收可入库</el-checkbox>
      <p class="my-3">历史退货：{{ returnRecords.length }} 笔</p>
      <el-table v-if="returnRecords.length" :data="returnRecords"><el-table-column prop="skuId" label="规格ID" /><el-table-column prop="quantity" label="数量" /><el-table-column prop="createdAt" label="入库时间" min-width="170" /></el-table>
      <template #footer><el-button :disabled="receiving" @click="returnDialog = false">关闭</el-button><el-button v-if="userStore.hasPermission('warehouse:view')" type="primary" :loading="receiving" @click="receiveReturns">确认入库</el-button></template>
    </el-dialog>
    <el-dialog v-model="dialog" title="申请退款" width="480px" :close-on-click-modal="!saving">
      <el-form label-width="90px">
        <el-form-item label="订单号"><el-input v-model="form.orderId" placeholder="完整订单号或订单ID" /></el-form-item>
        <el-form-item label="退款金额"><el-input-number v-model="form.amount" :min="0.01" :precision="2" /></el-form-item>
        <el-form-item label="退款原因"><el-input v-model="form.reason" type="textarea" maxlength="255" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="dialog = false" :disabled="saving">取消</el-button><el-button type="primary" @click="submit" :loading="saving">提交申请</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped>
.related-order {
  max-width: 100%;
  height: auto;
  white-space: normal;
  text-align: left;
  overflow-wrap: anywhere;
}
</style>
