<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Tickets, Refresh, Search } from '@element-plus/icons-vue'
import request from '@/lib/request'
import { useUserStore } from '@/stores/user'
import { recordState, isUncertain, money, platformName, voucherPlaceholder, readPending, savePending, clearPending, operationResolved } from '@/lib/group-buy'
import GroupBuyFulfillmentPanel from './GroupBuyFulfillmentPanel.vue'

const user = useUserStore()
const channels = ref([]), platform = ref('MEITUAN'), input = ref(''), preparation = ref(null), selectedId = ref('')
const rows = ref([]), total = ref(0), page = ref(1), loading = ref(false), busy = ref(false), error = ref('')
const pending = ref(null), recoveryError = ref(''), pendingRecord = ref(null)
const demoEnabled = ref(false)
const active = computed(() => channels.value.find(channel => channel.platform === platform.value))
const selected = computed(() => preparation.value?.certificates.find(certificate => certificate.id === selectedId.value))
const admin = computed(() => user.userInfo?.role === 'admin')
const identity = computed(() => `${user.currentStoreId}:${user.userInfo?.id}`)
const dateText = value => value ? String(value).replace('T', ' ').slice(0, 19) : '—'
let generation = 0, inspectGeneration = 0, loadGeneration = 0
function restore() {
  pendingRecord.value = null; recoveryError.value = ''
  try { pending.value = readPending(localStorage, user.currentStoreId, user.userInfo?.id) }
  catch (e) { pending.value = null; recoveryError.value = e.message }
}
function acceptRecord(record, version) {
  if (version !== generation) return
  if (!pending.value || pending.value.id === record.id) pendingRecord.value = record
  const pendingAction = pending.value?.action
  if (operationResolved(pending.value, record)) {
    clearPending(localStorage, user.currentStoreId, user.userInfo?.id); pending.value = null
  }
  if (record.state === 'VERIFIED' && pendingAction === 'cancel') ElMessage.warning(record.message || '平台未撤销此券，请核对原记录')
  else if (record.state === 'VERIFIED') ElMessage.success('平台已确认核销成功')
  else if (record.state === 'CANCELLED') ElMessage.success('平台已确认撤销成功')
  else ElMessage.warning(record.message || recordState(record.state))
}
async function load() {
  const version = generation, readVersion = ++loadGeneration
  loading.value = true; error.value = ''
  try {
    const [channelResult, recordResult] = await Promise.allSettled([request.get('/group-buy/channels', { silent: true }), request.get('/group-buy/records', { params: { page: page.value, size: 20 }, silent: true })])
    if (version !== generation || readVersion !== loadGeneration) return
    if (channelResult.status === 'fulfilled') channels.value = channelResult.value
    else throw channelResult.reason
    if (recordResult.status === 'fulfilled') { rows.value = recordResult.value.list; total.value = recordResult.value.total }
    else throw recordResult.reason
  } catch (e) { if (version === generation && readVersion === loadGeneration) error.value = e.response?.data?.message || e.message || '暂时无法读取核销记录' }
  finally { if (version === generation && readVersion === loadGeneration) loading.value = false }
}
async function inspect() {
  if (busy.value || pending.value || recoveryError.value || !active.value?.ready || !input.value.trim()) return
  const version = generation, inspection = ++inspectGeneration
  busy.value = true; preparation.value = null; selectedId.value = ''; error.value = ''
  try {
    const result = await request.post('/group-buy/prepare', { platform: platform.value, input: input.value.trim() }, { silent: true, timeout: 30000 })
    if (version !== generation || inspection !== inspectGeneration) return
    preparation.value = result; selectedId.value = result.certificates?.[0]?.id || ''
  } catch (e) { if (version === generation && inspection === inspectGeneration) error.value = e.response?.data?.message || e.message }
  finally { if (version === generation) busy.value = false }
}
async function loadDemoCapability() {
  const version = generation
  demoEnabled.value = false
  try {
    const result = await request.get('/group-buy/demo/capabilities', { silent: true })
    if (version === generation) demoEnabled.value = result.enabled === true
  } catch { /* The real redemption page remains usable when demo capability is unavailable. */ }
}
async function submitVerification(retry = false) {
  if (busy.value || recoveryError.value || (!retry && (pending.value || !selected.value)) || (retry && pending.value?.action !== 'verify')) return
  const version = generation
  busy.value = true; error.value = ''
  try {
    if (!retry) {
      const certificate = selected.value
      await ElMessageBox.confirm(`确认核销「${certificate.title}」这一张券？${preparation.value.amountLabel || '团购金额'} ¥${money(certificate.payAmount)}。`, '确认团购核销', { confirmButtonText: '确认核销', cancelButtonText: '返回检查' })
      if (version !== generation) return
      const intent = { id: preparation.value.id, action: 'verify', certificateId: certificate.id }
      savePending(localStorage, user.currentStoreId, user.userInfo?.id, intent); pending.value = intent
    }
    const intent = pending.value
    const result = await request.post('/group-buy/verify', { preparationId: intent.id, certificateId: intent.certificateId }, { silent: true, timeout: 30000 })
    if (version !== generation) return
    preparation.value = null; selectedId.value = ''; input.value = ''
    acceptRecord(result, version); await load()
  } catch (e) {
    if (version !== generation || ['cancel', 'close'].includes(e)) return
    // A first validation rejection happened before any platform verification; retries remain pending.
    if (!retry && e.response?.status === 400 && pending.value) { clearPending(localStorage, user.currentStoreId, user.userInfo?.id); pending.value = null }
    error.value = pending.value ? '原操作结果尚未确认，请查询原记录。重试原核销使用相同记录，不会另建核销。' : e.response?.data?.message || e.message
  } finally { if (version === generation) busy.value = false }
}
async function queryRecord(id = pending.value?.id) {
  if (!id || busy.value) return
  const version = generation; busy.value = true; error.value = ''
  try {
    const result = await request.post(`/group-buy/records/${id}/query`, {}, { silent: true, timeout: 30000 })
    acceptRecord(result, version); if (version === generation) await load()
  } catch (e) { if (version === generation) error.value = e.response?.data?.message || '暂时无法确认原记录，请稍后查询或在平台核对，勿另建核销' }
  finally { if (version === generation) busy.value = false }
}
async function cancelRecord(row) {
  if (!admin.value || busy.value || pending.value || recoveryError.value || row.state !== 'VERIFIED') return
  const version = generation; busy.value = true; error.value = ''
  try {
    const { value } = await ElMessageBox.prompt(`撤销「${row.title}」的核销。${row.platform === 'MEITUAN' ? '美团撤销后原券作废，新券由平台发送；点评券不支持撤销。' : '撤销结果以平台为准。'}请填写原因。`, '撤销核销', { inputValidator: text => !!text?.trim() && text.length <= 200 || '请填写200字以内的撤销原因', confirmButtonText: '确认撤销', cancelButtonText: '保留核销' })
    if (version !== generation) return
    const intent = { id: row.id, action: 'cancel' }
    savePending(localStorage, user.currentStoreId, user.userInfo?.id, intent); pending.value = intent
    const result = await request.post(`/group-buy/records/${row.id}/cancel`, { reason: value.trim() }, { silent: true, timeout: 30000 })
    acceptRecord(result, version); if (version === generation) await load()
  } catch (e) {
    if (version !== generation || ['cancel', 'close'].includes(e)) return
    if (e.response?.status === 400 && pending.value) { clearPending(localStorage, user.currentStoreId, user.userInfo?.id); pending.value = null }
    error.value = e.response?.data?.message || e.message || '撤销结果待确认，请查询原记录'
  } finally { if (version === generation) busy.value = false }
}
watch([platform, input], () => { preparation.value = null; selectedId.value = ''; inspectGeneration++ })
watch(identity, async () => {
  generation++; inspectGeneration++; busy.value = false; preparation.value = null; selectedId.value = ''; input.value = ''; channels.value = []; rows.value = []; page.value = 1
  restore(); await Promise.all([load(), loadDemoCapability()])
})
onMounted(async () => { restore(); await Promise.all([load(), loadDemoCapability()]) })
</script>

<template>
  <div class="group-buy-page">
    <div class="heading"><div><span class="eyebrow">门店收银</span><h1><el-icon><Tickets /></el-icon> 团购核销</h1><p>先验券，核对套餐，再确认核销。每次只处理一张普通团购券。</p></div><div class="heading-actions"><router-link v-if="demoEnabled" to="/group-buy/demo"><el-button type="warning" plain>模拟联动演练</el-button></router-link><el-button :icon="Refresh" :loading="loading" @click="load">刷新记录</el-button></div></div>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <el-alert v-if="recoveryError" :title="recoveryError" type="error" :closable="false" show-icon />
    <div v-if="pending" class="pending-box">
      <strong>{{ pending.action === 'verify' ? '原核销操作需要确认' : '原撤销操作需要确认' }}</strong>
      <p>{{ pendingRecord?.message || '请先查询原记录，并在平台核对券状态。结果待确认时，暂停提交其他券。' }}</p>
      <p v-if="pendingRecord?.remoteStatus">{{ pendingRecord.remoteStatus }}。券已使用也可能来自其他操作，仍需核对原记录。</p>
      <small>记录编号：{{ pending.id }}</small>
      <div><el-button :loading="busy" @click="queryRecord()">查询原平台状态</el-button><el-button v-if="pending.action === 'verify'" :disabled="busy" @click="submitVerification(true)">重试原核销请求</el-button></div>
    </div>
    <div class="channel-grid">
      <button v-for="channel in channels" :key="channel.platform" class="channel" :class="{ selected: platform === channel.platform }" :disabled="busy" @click="platform = channel.platform">
        <div><strong>{{ channel.name }}</strong><el-tag :type="channel.ready ? 'success' : 'info'">{{ channel.status }}</el-tag></div><p>{{ channel.description }}</p>
      </button>
    </div>
    <section class="panel">
      <div class="panel-title"><h2>读取团购券</h2><span>{{ active?.name || '正在读取接入状态' }}</span></div>
      <div v-if="active && !active.ready" class="empty-channel"><strong>{{ active.status }}</strong><p>{{ active.description }}</p><a :href="active.url" target="_blank" rel="noopener noreferrer">查看官方接入平台</a></div>
      <template v-else>
        <div class="scan-row"><el-input v-model="input" :placeholder="voucherPlaceholder(platform)" maxlength="4096" :disabled="busy || !!pending || !!recoveryError || !active?.ready" clearable @keyup.enter="inspect" /><el-button type="primary" :icon="Search" :loading="busy" :disabled="!!pending || !!recoveryError || !active?.ready || !input.trim()" @click="inspect">验券查询</el-button></div>
        <p class="hint">仅支持普通单次团购券；次卡、代金券、预约品等请使用平台工具处理。</p>
        <div v-if="preparation" class="certificate-list"><p>核对券信息，并选择这一笔要核销的券。此次验券有效至 {{ dateText(preparation.expiresAt) }}。</p><label v-for="certificate in preparation.certificates" :key="certificate.id" class="certificate"><input v-model="selectedId" type="radio" :value="certificate.id" :disabled="busy" /><div><strong>{{ certificate.title }}</strong><span>{{ certificate.codeMask }}</span></div><div class="amount"><small>{{ preparation.amountLabel || '顾客实付' }}</small><strong>¥{{ money(certificate.payAmount) }}</strong></div></label><el-button type="primary" :disabled="!selected || busy || !!pending || !!recoveryError" :loading="busy" @click="submitVerification(false)">确认核销所选券</el-button></div>
      </template>
    </section>
    <section class="panel">
      <div class="panel-title"><h2>核销记录</h2><span>平台金额为券信息，结算到账请以平台账单为准</span></div>
      <el-table v-loading="loading" :data="rows" empty-text="暂无核销记录" style="width: 100%">
        <el-table-column label="套餐 / 券码" min-width="230"><template #default="{ row }"><strong>{{ row.title }}</strong><div class="muted">{{ row.codeMask }} · {{ platformName(row.platform) }}</div></template></el-table-column>
        <el-table-column label="团购金额" min-width="175"><template #default="{ row }">¥{{ money(row.payAmount) }}<div class="muted">{{ row.amountLabel || '顾客实付' }}</div></template></el-table-column>
        <el-table-column label="状态" min-width="200"><template #default="{ row }"><el-tag :type="isUncertain(row.state) ? 'warning' : row.state === 'VERIFIED' ? 'success' : 'info'">{{ recordState(row.state) }}</el-tag><div class="muted">{{ row.remoteStatus || row.message }}</div></template></el-table-column>
        <el-table-column label="操作时间" min-width="170"><template #default="{ row }">{{ dateText(row.createdAt) }}<div class="muted">员工 #{{ row.operatorId }}</div></template></el-table-column>
        <el-table-column label="操作" width="170"><template #default="{ row }"><el-button v-if="!row.simulation" link type="primary" :disabled="busy" @click="queryRecord(row.id)">查询状态</el-button><el-button v-if="admin && row.state === 'VERIFIED' && !row.fulfillment && !row.simulation" link type="danger" :disabled="busy || !!pending || !!recoveryError" @click="cancelRecord(row)">撤销核销</el-button></template></el-table-column>
      </el-table>
      <div class="pagination"><el-pagination v-model:current-page="page" :total="total" :page-size="20" layout="total, prev, pager, next" @current-change="load" /></div>
    </section>
    <GroupBuyFulfillmentPanel :records="rows" :demo-enabled="demoEnabled" @refresh="load" />
  </div>
</template>

<style scoped>
.heading-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:flex-end}
.group-buy-page{display:flex;flex-direction:column;gap:20px;padding:24px;color:#26384a}.heading,.panel-title,.channel>div,.scan-row,.certificate{display:flex;align-items:center;justify-content:space-between;gap:16px}.heading h1{font-size:27px;margin:6px 0 10px;display:flex;align-items:center}.eyebrow{font-size:12px;color:#667a8a}.heading p,.channel p,.hint,.muted,.panel-title>span{color:#6d7e8d;font-size:13px;line-height:1.6}.heading p{margin:0}.channel-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.channel{padding:20px;text-align:left;background:#fff;border:1px solid #dee5ec;border-radius:12px;color:inherit;cursor:pointer}.channel.selected{border-color:#257eab;box-shadow:0 0 0 1px #257eab}.channel p{margin:12px 0 0}.panel{padding:24px;background:white;border:1px solid #e3e9ef;border-radius:12px}.panel-title{margin-bottom:20px}.panel-title h2{font-size:17px;margin:0;white-space:nowrap}.scan-row .el-input{flex:1}.empty-channel{padding:28px;text-align:center;background:#f7f9fc;border-radius:8px}.empty-channel p{font-size:14px;color:#6d7e8d;line-height:1.7}.empty-channel a{color:#187da9;font-size:14px}.hint{margin:12px 0 0}.certificate-list{margin-top:24px;display:flex;flex-direction:column;gap:12px}.certificate-list>p{font-size:13px;color:#6d7e8d}.certificate{padding:18px;background:#f7f9fc;border:1px solid #e2e9ef;border-radius:8px;cursor:pointer;justify-content:flex-start}.certificate>div{display:flex;flex-direction:column;gap:6px}.certificate>div>span,.certificate small{color:#6d7e8d;font-size:12px}.certificate .amount{margin-left:auto;text-align:right}.certificate-list>.el-button{align-self:flex-start;margin-top:8px}.pending-box{padding:20px;background:#fff8e8;border:1px solid #efdaaa;border-radius:12px}.pending-box p{font-size:14px;line-height:1.6}.pending-box small{display:block;color:#8a7343;margin-bottom:16px}.pending-box>div{display:flex;gap:12px;flex-wrap:wrap}.pagination{margin-top:20px;display:flex;justify-content:flex-end}.muted{margin-top:6px;font-size:12px}
@media(max-width:900px){.channel-grid{grid-template-columns:1fr}.channel>div,.panel-title{align-items:flex-start;flex-direction:column}.group-buy-page{padding:16px}.heading{align-items:stretch;flex-direction:column}.heading>.el-button{align-self:flex-end}.heading h1{font-size:23px}.scan-row{align-items:stretch;flex-direction:column}.panel{padding:18px}.panel-title>span{font-size:12px}}
</style>
