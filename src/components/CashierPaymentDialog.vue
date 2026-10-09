<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import QRCode from 'qrcode'
import request from '@/lib/request'
import { remainingPaymentSeconds } from '@/lib/cashier-result'
const props = defineProps({ modelValue: Boolean, orderId: [Number, String] })
const emit = defineEmits(['update:modelValue', 'confirmed', 'updated'])
const visible = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
const order = ref(null), qr = ref(''), error = ref(''), busy = ref(false), enabled = ref(false), elapsed = ref(0)
const seconds = computed(() => remainingPaymentSeconds(order.value, elapsed.value))
const countdown = computed(() => seconds.value === null ? '' : `${Math.floor(seconds.value / 60)}:${String(seconds.value % 60).padStart(2, '0')}`)
let timer, generation = 0
const active = version => version === generation && props.modelValue
const load = async (version = generation) => {
  const id = props.orderId
  const row = await request.get(`/orders/${id}`, { silent: true })
  if (!active(version)) return false
  order.value = row; elapsed.value = 0; emit('updated', row)
  if (Number(row.payStatus) === 2) { ElMessage.success('服务器已确认到账'); emit('confirmed', row); visible.value = false; return false }
  if (Number(row.status) !== 10) { error.value = '订单状态已改变，不能继续支付，请刷新订单列表。'; return false }
  return true
}
const query = async () => {
  if (busy.value || !props.orderId) return
  const version = generation, id = props.orderId
  busy.value = true
  try { if (enabled.value) await request.post(`/cashier/orders/${id}/payment-query`, {}, { silent: true }); if (active(version)) await load(version) }
  catch { if (active(version)) error.value = '暂未确认到账，系统会继续查询；请勿重复开单。' }
  finally { if (active(version)) busy.value = false }
}
const prepare = async () => {
  if (busy.value || !enabled.value || seconds.value === 0) return
  const version = generation, id = props.orderId
  busy.value = true; error.value = ''
  try {
    if (!await load(version) || seconds.value === 0) return
    const result = await request.post(`/cashier/orders/${id}/prepay`)
    const dataUrl = await QRCode.toDataURL(result.codeUrl, { width: 300 })
    if (active(version)) qr.value = dataUrl
  } catch { if (active(version)) error.value = '支付码暂未获取。可重试此订单或查询到账，请勿重复开单。' }
  finally { if (active(version)) busy.value = false }
}
watch(() => [props.modelValue, props.orderId], async ([open]) => {
  clearInterval(timer); const version = ++generation
  busy.value = false
  if (!open) return
  qr.value = ''; error.value = ''; order.value = null; elapsed.value = 0
  try {
    const capabilities = await request.get('/payment/capabilities')
    if (!active(version)) return
    enabled.value = Boolean(capabilities.wechat)
    if (!await load(version)) return
    if (enabled.value) await prepare()
    if (!active(version)) return
    timer = setInterval(() => { elapsed.value++; if (elapsed.value % 5 === 0) query() }, 1000)
  } catch { if (active(version)) error.value = '原订单暂时无法加载，请关闭后从订单列表重试。' }
})
onBeforeUnmount(() => { generation++; clearInterval(timer) })
</script>
<template>
  <el-dialog v-model="visible" title="继续原订单支付" width="440px">
    <el-alert v-if="!enabled" title="微信商户资料尚未启用，当前不会发生真实扣款。" type="info" :closable="false" />
    <el-alert v-if="error" :title="error" type="warning" :closable="false" class="mt-3" />
    <template v-if="order">
      <p class="mt-3 break-all">订单号：{{ order.orderNo }}</p><p>金额：¥ {{ Number(order.amountTotal || 0).toFixed(2) }}</p>
      <p v-if="seconds !== null" class="my-3">{{ seconds > 0 ? `付款剩余 ${countdown}` : '付款期限已结束，正在确认最终状态；请勿重复付款。' }}</p>
      <img v-if="qr && seconds !== 0" :src="qr" alt="微信付款二维码" class="mx-auto w-64" />
    </template>
    <div class="flex gap-2 mt-4"><el-button :disabled="!enabled || seconds === 0" :loading="busy" @click="prepare">获取/重试支付码</el-button><el-button :loading="busy" @click="query">查询到账</el-button></div>
    <p class="mt-3 text-sm text-slate-500">关闭后仍可从订单列表继续此订单；刷新页面不会重新开单。</p>
  </el-dialog>
</template>
