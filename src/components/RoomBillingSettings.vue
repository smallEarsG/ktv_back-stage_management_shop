<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { ElMessage } from 'element-plus'
import request from '@/lib/request'
const props = defineProps({ canEdit: Boolean })
const config = ref({ enabled: false, rules: [] }), options = ref({ rooms: [], skus: [] })
const loading = ref(false), saving = ref(false), error = ref(''), loaded = ref(false)
const types = computed(() => [...new Set(options.value.rooms.map(room => room.roomType))])
let generation = 0, disposed = false
async function load() {
  const version = ++generation
  loading.value = true; loaded.value = false
  try {
    const [saved, choices] = await Promise.all([request.get('/dining/room-billing/config', { silent: true }), request.get('/dining/room-billing/options', { silent: true })])
    if (version !== generation || disposed) return
    config.value = saved; options.value = choices; error.value = ''; loaded.value = true
  } catch (e) { if (version === generation && !disposed) error.value = e.message || '包厢计费配置加载失败，请重试' }
  finally { if (version === generation && !disposed) loading.value = false }
}
function addRule() { if (props.canEdit && loaded.value) config.value.rules.push({ scope: 'TYPE', target: '', skuId: null, periodMinutes: 60, graceMinutes: 0 }) }
async function save() {
  if (!props.canEdit || !loaded.value || saving.value) return
  saving.value = true
  const version = generation
  try {
    const saved = await request.put('/dining/room-billing/config', config.value)
    if (version !== generation || disposed) return
    config.value = saved; error.value = ''; ElMessage.success('包厢计费规则已保存，新开场次生效')
  } catch (e) { if (version === generation && !disposed) error.value = e.message || '计费规则保存失败' }
  finally { if (version === generation && !disposed) saving.value = false }
}
onMounted(load)
onBeforeUnmount(() => { disposed = true; generation++ })
</script>

<template>
  <section class="room-billing-settings">
    <div class="panel-heading"><div><h2>普通包厢自动计费</h2><p>开台时固定单价，修改规则只影响新场次。团购使用套餐自己的计费规则。</p></div><el-button :loading="loading" :disabled="saving" @click="load">重新加载</el-button></div>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <el-form label-position="top" :disabled="!canEdit || !loaded || saving || loading">
      <el-form-item label="启用自动计费"><el-switch v-model="config.enabled" active-text="新开包厢按规则计费" /></el-form-item>
      <p class="hint">请创建专用包厢计费商品，单价表示每个计费周期的费用；时间服务不扣实体库存。单独包厢规则优先于房型规则。宽限时间免收，超出的时间按计费周期向上取整；关闭配置仅影响新场次，未配置规则的包厢维持人工收费。</p>
      <article v-for="(rule, index) in config.rules" :key="index" class="billing-rule">
        <div class="rule-fields">
          <el-form-item label="适用范围"><el-select v-model="rule.scope" @change="rule.target = ''"><el-option label="按房型" value="TYPE" /><el-option label="指定包厢" value="ROOM" /></el-select></el-form-item>
          <el-form-item :label="rule.scope === 'ROOM' ? '包厢' : '房型'"><el-select v-model="rule.target" filterable><template v-if="rule.scope === 'ROOM'"><el-option v-for="room in options.rooms" :key="room.roomId" :value="room.roomId" :label="room.roomId" /></template><template v-else><el-option v-for="type in types" :key="type" :value="type" :label="type" /></template></el-select></el-form-item>
          <el-form-item label="收费商品规格"><el-select v-model="rule.skuId" filterable placeholder="每个周期的收费商品"><el-option v-for="sku in options.skus" :key="sku.skuId" :value="sku.skuId" :label="`${sku.name} #${sku.skuId} · ¥${Number(sku.price).toFixed(2)}`" /></el-select></el-form-item>
          <el-form-item label="计费周期（分钟）"><el-input-number v-model="rule.periodMinutes" :min="1" :max="1440" /></el-form-item>
          <el-form-item label="免收宽限（分钟）"><el-input-number v-model="rule.graceMinutes" :min="0" :max="1440" /></el-form-item>
        </div>
        <el-button type="danger" plain @click="config.rules.splice(index, 1)">删除这条规则</el-button>
      </article>
      <div class="actions"><el-button @click="addRule">添加计费规则</el-button><el-button type="primary" :loading="saving" @click="save">保存计费配置</el-button></div>
      <p v-if="!canEdit" class="hint">请联系店长调整计费规则。</p>
    </el-form>
  </section>
</template>

<style scoped>
.room-billing-settings{padding:24px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;margin-top:20px}.panel-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}.panel-heading h2{font-size:18px;font-weight:600}.panel-heading p,.hint{font-size:13px;line-height:1.7;color:#64748b;margin:8px 0 16px}.billing-rule{border:1px solid #e2e8f0;background:#f8fafc;border-radius:10px;padding:16px;margin:16px 0}.rule-fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0 16px}.el-select,.el-input-number{width:100%}.actions{display:flex;flex-wrap:wrap;gap:8px}.actions .el-button{margin-left:0}@media(max-width:700px){.room-billing-settings{padding:16px}.panel-heading{flex-direction:column}.rule-fields{grid-template-columns:1fr}}
</style>
