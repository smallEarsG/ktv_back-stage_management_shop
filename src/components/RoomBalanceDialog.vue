<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import request from '@/lib/request'
import { useUserStore } from '@/stores/user'
import { cashChange } from '@/lib/cashier-workspace'
import dayjs from 'dayjs'

const props = defineProps({ modelValue: Boolean, roomId: String })
const emit = defineEmits(['update:modelValue', 'settled'])
const userStore = useUserStore()
const visible = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
const orders = ref([]), amount = ref(null), received = ref(undefined), confirmed = ref(false)
const loading = ref(false), settling = ref(false), error = ref('')
let generation = 0
const change = computed(() => cashChange(amount.value, received.value))
const load = async () => {
  const version = ++generation, room = props.roomId
  loading.value = true; error.value = ''; confirmed.value = false; received.value = undefined; orders.value = []; amount.value = null
  try {
    const result = await request.get('/orders/room-unsettled', { params: { roomId: room }, silent: true })
    if (version !== generation || !props.modelValue) return
    orders.value = result.orders || []; amount.value = Number(result.amountTotal)
  } catch {
    if (version === generation) error.value = '未结账款加载失败，请重试。'
  } finally { if (version === generation) loading.value = false }
}
watch(() => [props.modelValue, props.roomId], ([open]) => { if (open) load(); else generation++ })
const settle = async () => {
  if (settling.value || loading.value || error.value || !orders.value.length || !confirmed.value || change.value === null || !userStore.hasPermission('pos:view')) return
  const room = props.roomId
  settling.value = true
  try {
    const result = await request.post(`/cashier/rooms/${encodeURIComponent(room)}/settle`, {
      orderIds: orders.value.map(row => row.id), payMethod: 2, expectedAmount: amount.value, cashReceived: received.value
    })
    ElMessage.success(`已结算 ${result.settledCount} 单，找零 ¥${Number(result.changeAmount || 0).toFixed(2)}`)
    emit('settled'); visible.value = false
  } catch {
    error.value = '结算结果需核对，请刷新账款；已到账订单不会再次结算。'
    confirmed.value = false
  } finally { settling.value = false }
}
</script>

<template>
  <el-dialog v-model="visible" :title="`${roomId} · 挂账待结`" width="min(680px, 94vw)" :close-on-click-modal="!settling" :close-on-press-escape="!settling" :show-close="!settling">
    <el-alert v-if="error" :title="error" type="warning" :closable="false" class="mb-3" />
    <div v-loading="loading">
      <p class="mb-3">待结 {{ loading ? '—' : orders.length }} 单 · 应收 <strong class="text-red-600">{{ amount === null ? '—' : `¥ ${amount.toFixed(2)}` }}</strong></p>
      <el-table :data="orders" max-height="320" border size="small">
        <el-table-column prop="orderNo" label="订单号" min-width="210" />
        <el-table-column label="开单时间" min-width="155"><template #default="{ row }">{{ dayjs(row.createdAt).format('YYYY-MM-DD HH:mm:ss') }}</template></el-table-column>
        <el-table-column label="金额" width="100" align="right"><template #default="{ row }">¥ {{ Number(row.amountTotal).toFixed(2) }}</template></el-table-column>
      </el-table>
      <template v-if="orders.length && userStore.hasPermission('pos:view')">
        <el-form label-width="90px" class="mt-4">
          <el-form-item label="实收现金"><el-input-number v-model="received" :min="0" :precision="2" :controls="false" :disabled="settling" placeholder="请输入实收金额" /></el-form-item>
          <el-form-item label="找零">{{ change === null ? '请填写足额现金' : `¥ ${change.toFixed(2)}` }}</el-form-item>
        </el-form>
        <el-checkbox v-model="confirmed" :disabled="settling">已核对房间及全部订单，并收到上述现金</el-checkbox>
        <p class="mt-2 text-xs text-slate-500">仅结算本次展示的订单；随后新增的挂账会保留。</p>
      </template>
    </div>
    <template #footer>
      <el-button :disabled="settling" :loading="loading" @click="load">刷新账款</el-button>
      <el-button :disabled="settling" @click="visible = false">关闭</el-button>
      <el-button v-if="userStore.hasPermission('pos:view')" type="primary" :loading="settling" :disabled="loading || !!error || !orders.length || !confirmed || change === null" @click="settle">确认现金结算</el-button>
    </template>
  </el-dialog>
</template>
