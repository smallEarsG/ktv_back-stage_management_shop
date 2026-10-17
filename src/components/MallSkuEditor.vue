<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { addSkuCombinations, dimensionsFromSkus, skuFields } from '@/lib/mall-product-editor'
import { newRequestKey } from '@/lib/operations'

const props = defineProps({ modelValue: { type: Array, required: true } })
const emit = defineEmits(['update:modelValue'])
const dimensions = ref(dimensionsFromSkus(props.modelValue)), error = ref(''), showBuilder = ref(false)
const prefix = `SP-${newRequestKey().replace(/[^a-zA-Z0-9]/g, '').slice(0, 20)}`
const update = (index, key, value) => emit('update:modelValue', props.modelValue.map((sku, i) => i === index ? { ...sku, [key]: value } : sku))
function field(index, fieldIndex, key, value) {
  update(index, 'fields', props.modelValue[index].fields.map((item, i) => i === fieldIndex ? { ...item, [key]: value } : item))
}
function addValue(dimension) {
  const values = dimension.draft.split(/[,，、\n]/).map(value => value.trim()).filter(Boolean)
  dimension.values = [...new Set([...dimension.values, ...values])]; dimension.draft = ''
}
function generate() {
  error.value = ''
  try {
    dimensions.value.forEach(addValue)
    const value = addSkuCombinations(props.modelValue, dimensions.value, prefix)
    emit('update:modelValue', value)
    ElMessage.success(`当前共有${value.length}个规格，已有规格已保留`)
  } catch (e) { error.value = e.message }
}
function addDefault() {
  emit('update:modelValue', [...props.modelValue, skuFields({ skuCode: `${prefix}-${newRequestKey().slice(-8)}`, price: 0.01, stock: 0, weightGrams: 0 })])
}
</script>

<template>
  <section class="sku-workspace">
    <header><div><h3>商品规格</h3><p>直接填写规格名称和值；已有规格的库存通过“调库存”维护。</p></div><el-button @click="showBuilder = !showBuilder">{{ showBuilder ? '收起组合工具' : '批量组合规格' }}</el-button></header>
    <section v-if="showBuilder" class="combination-builder">
      <h4>例如：颜色有红、白两种，容量有400ml、500ml两种，可生成4个组合。</h4>
      <article v-for="(dimension, index) in dimensions" :key="index" class="dimension-row">
        <el-input v-model="dimension.name" placeholder="规格名称，如颜色" :aria-label="`第${index + 1}个规格名称`" maxlength="40" />
        <div><div class="value-tags"><el-tag v-for="value in dimension.values" :key="value" closable @close="dimension.values = dimension.values.filter(item => item !== value)">{{ value }}</el-tag></div><el-input v-model="dimension.draft" placeholder="输入规格值，多个值用逗号隔开" :aria-label="`第${index + 1}个规格值`" @keydown.enter.prevent="addValue(dimension)"><template #append><el-button @click="addValue(dimension)">添加</el-button></template></el-input></div>
        <el-button text type="danger" @click="dimensions.splice(index, 1)">移除</el-button>
      </article>
      <div class="sku-actions"><el-button :disabled="dimensions.length >= 5" @click="dimensions.push({ name: '', values: [], draft: '' })">添加规格维度</el-button><el-button type="primary" plain @click="generate">生成缺少的组合</el-button></div><p>已有规格会保留，价格、编码和库存不会被覆盖。不需要的规格请在下方逐项移除。</p>
      <el-alert v-if="error" :title="error" type="error" :closable="false" />
    </section>
    <article v-for="(sku, index) in modelValue" :key="sku.id || `new-${index}`" class="sku-card">
      <header><strong>规格 {{ index + 1 }} <small v-if="sku.id">已有规格</small></strong><el-button :disabled="modelValue.length < 2" text type="danger" @click="emit('update:modelValue', modelValue.filter((_, i) => i !== index))">移除此规格</el-button></header>
      <div v-for="(item, fieldIndex) in sku.fields" :key="fieldIndex" class="spec-pair"><el-input :model-value="item.name" placeholder="规格名称，如颜色" :aria-label="`规格${index + 1}属性${fieldIndex + 1}名称`" maxlength="40" @update:model-value="field(index, fieldIndex, 'name', $event)" /><el-input :model-value="item.value" placeholder="规格值，如暖红" :aria-label="`规格${index + 1}属性${fieldIndex + 1}值`" maxlength="80" @update:model-value="field(index, fieldIndex, 'value', $event)" /><el-button text aria-label="移除此规格属性" @click="update(index, 'fields', sku.fields.filter((_, i) => i !== fieldIndex))">移除</el-button></div>
      <el-button text type="primary" @click="update(index, 'fields', [...sku.fields, { name: '', value: '' }])">＋ 添加规格属性</el-button><span v-if="!sku.fields.length" class="sku-hint">不设置属性时为默认规格</span>
      <div class="sku-numbers"><el-form-item label="售价（元）"><el-input-number :model-value="sku.price" :min="0.01" :precision="2" controls-position="right" @update:model-value="update(index, 'price', $event)" /></el-form-item><el-form-item :label="sku.id ? '当前库存（只读）' : '初始库存（件）'"><el-input-number :model-value="sku.stock" :disabled="!!sku.id" :min="0" :max="9999999" :precision="0" controls-position="right" @update:model-value="update(index, 'stock', $event)" /></el-form-item><el-form-item label="重量（克）"><el-input-number :model-value="sku.weightGrams" :min="0" :max="9999999" :precision="0" controls-position="right" @update:model-value="update(index, 'weightGrams', $event)" /></el-form-item></div>
      <details><summary>规格编码（自动生成，可修改）</summary><el-input :model-value="sku.skuCode" placeholder="留空自动生成" maxlength="80" :aria-label="`规格${index + 1}编码`" @update:model-value="update(index, 'skuCode', $event)" /></details>
    </article><el-button class="add-single-sku" @click="addDefault">＋ 手动添加一个规格</el-button>
  </section>
</template>

<style scoped>
.sku-workspace{display:grid;gap:14px}.sku-workspace header{display:flex;align-items:center;justify-content:space-between;gap:12px}.sku-workspace h3{font-size:16px;margin:0;color:#1e293b}.sku-workspace p,.sku-hint{font-size:12px;color:#64748b;line-height:1.7;margin:5px 0}.combination-builder,.sku-card{border:1px solid #e2e8f0;border-radius:10px;padding:16px}.combination-builder{background:#f8faff}.combination-builder h4{font-size:13px;font-weight:400;color:#475569;margin:0 0 14px}.dimension-row{display:grid;grid-template-columns:150px minmax(0,1fr) 56px;gap:10px;margin:12px 0;align-items:start}.value-tags{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px}.sku-actions{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0}.sku-card>header{margin-bottom:12px}.sku-card strong{font-size:14px;color:#334155}.sku-card small{font-size:12px;font-weight:400;color:#64748b;margin-left:8px}.spec-pair{display:grid;grid-template-columns:1fr 1fr 56px;gap:10px;margin:8px 0}.sku-numbers{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:12px}.sku-numbers :deep(.el-input-number){width:100%}details{font-size:12px;color:#64748b}summary{cursor:pointer;padding:4px 0 8px}.add-single-sku{justify-self:start}.sku-actions .el-button+.el-button{margin:0}@media(max-width:600px){.sku-workspace>header{align-items:start;flex-direction:column}.dimension-row{grid-template-columns:minmax(0,1fr) 56px}.dimension-row>.el-input{grid-column:1/-1}.spec-pair{grid-template-columns:minmax(0,1fr) minmax(0,1fr) 44px;gap:6px}.sku-card,.combination-builder{padding:12px}.sku-numbers{grid-template-columns:1fr;gap:0}}
</style>
