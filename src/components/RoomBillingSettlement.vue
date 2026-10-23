<script setup>
import { createRecoveryStorage, canReleaseRecovery } from '@/lib/recovery-storage'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import request from '@/lib/request'
import { useUserStore } from '@/stores/user'
import { money } from '@/lib/dining'
const props = defineProps({ sessionId: [Number, String] })
const emit = defineEmits(['settled'])
const user = useUserStore(), bill = ref(null), loading = ref(false), busy = ref(false), error = ref('')
const recoveryStorage = createRecoveryStorage(localStorage, user.userInfo?.id)
const cash = ref(null), confirmed = ref(false), pending = ref(null), recoveryError = ref('')
const identity = computed(() => `${user.currentStoreId}:${user.userInfo?.id}`)
const storageKey = () => `room-billing:${identity.value}`
const canSettle = computed(() => user.hasPermission('pos:view'))
const ready = computed(() => canSettle.value && !pending.value && !busy.value && bill.value && !bill.value.settled && confirmed.value && cash.value !== null && Number(cash.value) >= Number(bill.value.amountDue))
let generation = 0, reading = 0, disposed = false
function restore() {
  recoveryError.value = ''
  try {
    const saved = JSON.parse(recoveryStorage.getItem(storageKey()) || 'null')
    if (saved && (!/^[1-9]\d*$/.test(String(saved.sessionId)) || !saved.body?.requestKey || !Number.isFinite(Number(saved.body.expectedAmount)) || !Number.isFinite(Number(saved.body.cashReceived)))) throw new Error('恢复记录格式无效')
    pending.value = saved
  } catch (e) { recoveryError.value = e.code === 'RECOVERY_LEGACY' ? e.message : '包厢收款恢复记录无法读取，请联系店长核对后处理；原记录已保留。'; pending.value = { invalid: true } }
}
async function load() {
  const sid = props.sessionId, version = generation, current = ++reading
  if (!sid) return
  loading.value = true
  try {
    const value = await request.get(`/dining/sessions/${sid}/room-bill`, { silent: true })
    if (disposed || version !== generation || current !== reading || props.sessionId !== sid) return
    if (Number(value.sessionId) !== Number(sid)) throw new Error('账单与当前场次不符，请重新查询')
    if (!bill.value || money(bill.value.amountDue) !== money(value.amountDue) || bill.value.revision !== value.revision) confirmed.value = false
    bill.value = value; error.value = ''
  } catch (e) { if (!disposed && version === generation && current === reading) error.value = e.message || '计时账单查询失败' }
  finally { if (!disposed && version === generation && current === reading) loading.value = false }
}
async function recover() {
  if (!canSettle.value || !pending.value || pending.value.invalid || busy.value) return
  const operation = pending.value, version = generation
  busy.value = true
  try {
    const receipt = await request.post(`/dining/sessions/${operation.sessionId}/room-settle`, operation.body, { silent: true, timeout: 30000 })
    if (disposed || version !== generation) return
    if (Number(receipt.sessionId) !== Number(operation.sessionId) || receipt.requestKey !== operation.body.requestKey || !receipt.settled) throw new Error('收据与原收款不符，请恢复原操作核对')
    recoveryStorage.removeItem(storageKey()); pending.value = null; error.value = ''; confirmed.value = false
    if (Number(props.sessionId) === Number(operation.sessionId)) bill.value = receipt
    ElMessage.success(`包厢已结账，找零 ¥${money(receipt.change)}`); emit('settled')
  } catch (e) {
    if (disposed || version !== generation) return
    if (canReleaseRecovery(e)) { recoveryStorage.removeItem(storageKey()); pending.value = null; await load() }
    error.value = e.message || '收款结果未确认，请恢复原收款'
  } finally { if (!disposed && version === generation) busy.value = false }
}
async function settle() {
  if (!ready.value) return
  const operation = { sessionId: props.sessionId, body: { requestKey: crypto.randomUUID(), revision: bill.value.revision, expectedAmount: money(bill.value.amountDue), cashReceived: money(cash.value) } }
  try { recoveryStorage.setItem(storageKey(), JSON.stringify(operation)); pending.value = operation }
  catch { error.value = '无法保存收款恢复记录，暂不能收款'; return }
  await recover()
}
watch(cash, () => { confirmed.value = false })
watch([() => props.sessionId, identity], () => { generation++; reading++; bill.value = null; cash.value = null; confirmed.value = false; busy.value = false; loading.value = false; error.value = ''; restore(); load() }, { immediate: true })
onBeforeUnmount(() => { disposed = true; generation++; reading++ })
</script>

<template>
  <section class="room-bill">
    <div class="title-row"><h3>普通包厢计时账单</h3><el-button :loading="loading" :disabled="busy" @click="load">刷新计时账单</el-button></div>
    <el-alert v-if="recoveryError || error" :title="recoveryError || error" type="error" :closable="false" show-icon />
    <el-alert v-if="pending" type="warning" :closable="false" title="有一笔包厢收款结果待确认，请先恢复原收款。"><p v-if="!pending.invalid">原场次 #{{ pending.sessionId }}，按原金额与请求号查询。</p><el-button v-if="!pending.invalid && canSettle" :loading="busy" @click="recover">恢复原收款</el-button></el-alert>
    <template v-if="bill">
      <p>{{ bill.name }} · ¥{{ money(bill.unitPrice) }} / {{ bill.periodMinutes }}分钟</p>
      <p>消费 {{ bill.minutes }}分钟 · 免收 {{ bill.graceMinutes }}分钟 · 计费 {{ bill.units }}个周期</p>
      <div class="amounts"><span>包厢计时 ¥{{ money(bill.roomDue) }}</span><span>尚未收款商品 ¥{{ money(bill.itemsDue) }}</span><strong>本次合计 ¥{{ money(bill.amountDue) }}</strong></div>
      <p class="hint">{{ bill.billingNote }}</p>
      <template v-if="bill.settled"><el-tag type="success">计时费已结清</el-tag><p>实收 ¥{{ money(bill.cashReceived) }} · 找零 ¥{{ money(bill.change) }}</p><p class="hint">收据已固定。完成出餐和售后后，可以结束消费并清台。</p></template>
      <template v-else-if="canSettle"><el-input-number v-model="cash" :min="0" :precision="2" :controls="false" :disabled="busy || !!pending" aria-label="普通包厢实收现金" placeholder="实收现金" /><p>找零 ¥{{ money(Math.max(0, Number(cash || 0) - Number(bill.amountDue))) }}</p><el-checkbox v-model="confirmed" :disabled="busy || !!pending">已收到以上现金，包含包厢计时与所有未收商品</el-checkbox><el-button type="primary" :disabled="!ready" :loading="busy" @click="settle">确认包厢结账</el-button></template>
      <p v-else class="hint">请联系收银员完成结账。</p>
    </template>
  </section>
</template>

<style scoped>
.room-bill{padding:16px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;margin:16px 0}.title-row{display:flex;justify-content:space-between;gap:12px;align-items:center}.title-row h3{font-weight:600}.amounts{display:flex;flex-wrap:wrap;gap:12px;margin:12px 0}.hint{color:#64748b;font-size:13px;line-height:1.7}.room-bill p{margin:8px 0;overflow-wrap:anywhere}.el-checkbox{display:flex;white-space:normal;height:auto;margin:12px 0}.el-button{max-width:100%}@media(max-width:600px){.title-row{align-items:flex-start;flex-direction:column}.amounts{flex-direction:column}}
</style>
