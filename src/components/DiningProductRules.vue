<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import request from '@/lib/request'
import { money } from '@/lib/dining'
const props = defineProps({ modelValue: Boolean, product: Object })
const emit = defineEmits(['update:modelValue'])
const visible = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
const form = reactive({ unit: '份', station: '厨房', soldOut: false, dailyLimit: 0, extras: [], bundle: [] })
const skus = ref([]), loading = ref(false), saving = ref(false), error = ref('')
let generation = 0
watch(() => [props.modelValue, props.product?.id], async () => {
  const version = ++generation
  if (!props.modelValue || !props.product?.id) return
  loading.value = true; error.value = ''
  try {
    const [rule, options] = await Promise.all([request.get(`/dining/products/${props.product.id}`), (async () => { const all = []; let page = 1; while (page <= 100) { const data = await request.get('/products', { params: { page, pageSize: 100 } }); const list = data.list || data.records || []; all.push(...list); if (!list.length || all.length >= Number(data.total || all.length)) break; page++ }; return all })()])
    if (version !== generation) return
    Object.assign(form, rule)
    skus.value = options.filter(p => p.id !== props.product.id && p.status !== false).flatMap(p => (p.skus || []).map(s => ({ id: s.id, label: `${p.name} · ¥${money(s.price)}` })))
  } catch (e) { if (version === generation) error.value = e.message }
  finally { if (version === generation) loading.value = false }
}, { immediate: true })
async function save() {
  if (saving.value || error.value) return
  saving.value = true
  try { await request.put(`/dining/products/${props.product.id}`, { ...form }); ElMessage.success('点餐设置已保存'); visible.value = false }
  catch (e) { error.value = e.message } finally { saving.value = false }
}
</script>
<template>
  <el-dialog v-model="visible" :title="`${product?.name || ''} · 点餐设置`" width="min(760px,96vw)" :close-on-click-modal="false">
    <el-alert v-if="error" :title="error" type="error" :closable="false" class="mb-4" />
    <el-form v-loading="loading" label-position="top" :disabled="saving || loading">
      <div class="rule-grid"><el-form-item label="销售单位"><el-input v-model="form.unit" maxlength="8" placeholder="份 / 瓶 / 杯" /></el-form-item><el-form-item label="制作区域"><el-input v-model="form.station" maxlength="64" placeholder="厨房 / 吧台 / 凉菜间" /></el-form-item><el-form-item label="今日售卖限量"><el-input-number v-model="form.dailyLimit" :min="0" :max="1000000" :precision="0" /><p>0 表示不设每日限量，仍受实际库存限制。</p></el-form-item><el-form-item label="临时售罄"><el-switch v-model="form.soldOut" active-text="暂停售卖" /></el-form-item></div>
      <h3>可加配料</h3><p>选择已有商品作为配料，按该规格的价格计费并扣库存。</p><div v-for="(extra, i) in form.extras" :key="i" class="rule-row"><el-input v-model="extra.label" placeholder="配料名称" maxlength="30" /><el-select v-model="extra.skuId" filterable placeholder="选择配料商品"><el-option v-for="s in skus" :key="s.id" :label="s.label" :value="s.id" /></el-select><el-input-number v-model="extra.max" :min="1" :max="10" :precision="0" /><el-button @click="form.extras.splice(i, 1)">移除</el-button></div><el-button :disabled="form.extras.length >= 20" @click="form.extras.push({ label: '', skuId: null, max: 1 })">添加配料</el-button>
      <h3>套餐包含商品</h3><p>套餐售价使用本商品的规格价格；以下商品包含在套餐内，按实际数量扣库存。</p><div v-for="(item, i) in form.bundle" :key="i" class="rule-row"><el-select v-model="item.skuId" filterable placeholder="选择套餐内商品"><el-option v-for="s in skus" :key="s.id" :label="s.label" :value="s.id" /></el-select><el-input-number v-model="item.qty" :min="1" :max="100" :precision="0" /><el-button @click="form.bundle.splice(i, 1)">移除</el-button></div><el-button :disabled="form.bundle.length >= 30" @click="form.bundle.push({ skuId: null, qty: 1 })">添加套餐商品</el-button>
    </el-form><template #footer><el-button @click="visible = false">取消</el-button><el-button type="primary" :loading="saving" :disabled="loading || !!error" @click="save">保存点餐设置</el-button></template>
  </el-dialog>
</template>
<style scoped>
.rule-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.rule-row{display:flex;gap:10px;align-items:center;margin-bottom:12px}.rule-row>.el-select{flex:2;min-width:150px}.rule-row>.el-input{flex:1;min-width:100px}h3{font-size:16px;margin:24px 0 6px}p{font-size:12px;line-height:1.6;color:#64748b;margin:8px 0 16px}.el-button{min-height:38px}@media(max-width:650px){.rule-grid{grid-template-columns:1fr}.rule-row{flex-wrap:wrap}.rule-row>.el-select{width:100%;flex:auto}.rule-row>.el-input{width:100%;flex:auto}}
</style>
