<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { ElMessageBox } from 'element-plus'

const props = defineProps({ config: { type: Object, required: true }, busy: Boolean, readonly: Boolean })
const emit = defineEmits(['save', 'dirty'])
const model = reactive({}), baseline = ref(''), advanced = ref([])
function reset() {
  Object.keys(model).forEach(key => delete model[key])
  Object.assign(model, JSON.parse(JSON.stringify(props.config)))
  baseline.value = JSON.stringify(model)
}
watch(() => props.config.version, reset, { immediate: true })
const dirty = computed(() => JSON.stringify(model) !== baseline.value)
watch(dirty, value => emit('dirty', value), { immediate: true })
const invalid = computed(() => {
  if (!Array.isArray(model.tiers) || !model.tiers.length) return '至少保留一个会员等级'
  let previous = -1, discount = 10
  const names = new Set()
  for (const [index, tier] of model.tiers.entries()) {
    const growth = Number(tier.minGrowth), rate = Number(tier.discountRate), name = String(tier.name || '').trim()
    if (!name || names.has(name)) return '等级名称不能为空或重复'
    names.add(name)
    if (!Number.isFinite(growth) || (index === 0 && growth !== 0) || growth <= previous) return '首个等级从0成长值开始，后续门槛依次递增'
    if (!Number.isFinite(rate) || rate < 0.001 || rate > discount) return '折扣需在0.001至10折之间，升级后的优惠不能减少'
    previous = growth; discount = rate
  }
  if ([model.pointsPerYuan, model.pointsPerYuanRedeem, model.maxPointsPercent, model.birthdayAdvanceDays].some(value => value == null || !Number.isFinite(Number(value)))) return '请完整填写积分和生日规则'
  return ''
})
async function discard() {
  if (dirty.value) { try { await ElMessageBox.confirm('放弃本次尚未保存的会员规则修改？', '恢复已保存规则', { confirmButtonText: '放弃修改', cancelButtonText: '继续编辑', type: 'warning' }) } catch { return } }
  reset()
}
onBeforeRouteLeave(async () => {
  if (props.busy) return false
  if (!dirty.value) return true
  try { await ElMessageBox.confirm('会员规则尚未保存，离开后这些修改会丢失。', '离开此页面？', { confirmButtonText: '放弃并离开', cancelButtonText: '继续编辑', type: 'warning' }); return true } catch { return false }
})
const beforeUnload = event => { if (dirty.value) { event.preventDefault(); event.returnValue = '' } }
window.addEventListener('beforeunload', beforeUnload)
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
const displayRate = rate => Number(rate || 0).toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
</script>

<template>
  <el-form class="member-rules-editor" label-position="top" @submit.prevent="!invalid && dirty && !busy && !readonly && emit('save', JSON.parse(JSON.stringify(model)))">
    <fieldset :disabled="busy || readonly">
      <section class="rules-panel rules-enabled"><div><h2>会员权益</h2><p>统一管理本商城的积分、生日权益与会员等级。</p></div><el-switch :disabled="busy || readonly" v-model="model.enabled" active-text="已启用" inactive-text="未启用" aria-label="启用会员权益" /></section>
      <el-alert v-if="!model.enabled" title="当前未启用会员优惠；下面的规则可先配置，启用并保存后生效。" type="info" :closable="false" />
      <section class="rules-panel"><div class="rules-section-title"><span>01</span><div><h2>积分奖励与抵扣</h2><p>奖励在订单完成后入账；运费不参与会员优惠。</p></div></div><div class="rule-fields">
        <el-form-item label="每消费1元奖励"><div class="number-unit"><el-input-number v-model="model.pointsPerYuan" :min="0" :max="1000" :precision="0" controls-position="right" aria-label="每消费1元奖励积分" /><span>积分</span></div><small>填写0表示不赠送消费积分。</small></el-form-item>
        <el-form-item label="抵扣1元所需"><div class="number-unit"><el-input-number v-model="model.pointsPerYuanRedeem" :min="1" :max="100000" :precision="0" controls-position="right" aria-label="抵扣1元所需积分" /><span>积分</span></div></el-form-item>
        <el-form-item label="最高抵扣比例"><div class="number-unit"><el-input-number v-model="model.maxPointsPercent" :min="0" :max="100" :precision="0" controls-position="right" aria-label="积分最高抵扣比例" /><span>%</span></div><small>按会员折扣和优惠券减免后的商品金额计算。</small></el-form-item>
      </div><div class="rule-example"><strong>规则示例</strong><p>订单完成，符合奖励条件的商品实付100元，可获 {{ Math.floor(100 * Number(model.pointsPerYuan || 0)) }} 积分。优惠后商品金额100元，积分最多抵扣 {{ Number(model.maxPointsPercent || 0).toFixed(2) }} 元，且需保留至少0.01元商品实付。</p><p>实际使用受顾客可用积分、订单优惠和退款情况影响。</p></div></section>
      <section class="rules-panel"><div class="rules-section-title"><span>02</span><div><h2>生日权益</h2><p>使用会员登记的生日，生日券按活动规则发放。</p></div></div><el-form-item label="生日券提前发放时间"><div class="number-unit"><el-input-number v-model="model.birthdayAdvanceDays" :min="0" :max="30" :precision="0" controls-position="right" aria-label="生日前发放天数" /><span>天</span></div><small>{{ Number(model.birthdayAdvanceDays) === 0 ? '生日当天进入发放范围。' : `生日在未来${model.birthdayAdvanceDays}天内的会员进入发放范围。` }}</small></el-form-item><div class="rule-example"><p>还需配置并启用生日券，在优惠券活动页执行生日活动。同一会员的年度领取上限按券规则控制。</p><RouterLink to="/mall/coupons">管理生日券与活动 →</RouterLink></div></section>
      <section class="rules-panel"><div class="rules-section-title"><span>03</span><div><h2>会员等级</h2><p>成长值门槛依次递增，10折为原价，9.5折即优惠5%。</p></div></div>
        <article v-for="(tier, index) in model.tiers" :key="index" class="member-tier-card"><div class="tier-index">等级 {{ index + 1 }}</div><div class="tier-fields"><el-form-item label="等级名称"><el-input v-model="tier.name" maxlength="40" placeholder="如银卡会员" :aria-label="`等级${index + 1}名称`" /></el-form-item><el-form-item label="最低成长值"><div class="number-unit"><el-input-number v-model="tier.minGrowth" :min="0" :precision="2" controls-position="right" :aria-label="`等级${index + 1}最低成长值`" /><span>成长值</span></div></el-form-item><el-form-item label="会员折扣"><div class="number-unit"><el-input-number v-model="tier.discountRate" :min="0.001" :max="10" :precision="3" :step="0.1" controls-position="right" :aria-label="`等级${index + 1}折扣`" /><span>折</span></div></el-form-item></div><footer><span>商品原价100元，{{ displayRate(tier.discountRate) }}折后为 <strong>¥{{ (Number(tier.discountRate || 0) * 10).toFixed(2) }}</strong>（优惠券和积分另算）</span><el-button text type="danger" :disabled="model.tiers.length < 2" @click="model.tiers.splice(index, 1)">移除等级</el-button></footer></article>
        <el-button :disabled="model.tiers?.length >= 10" @click="model.tiers.push({ name: '', minGrowth: Number(model.tiers.at(-1)?.minGrowth || 0) + 100, discountRate: model.tiers.at(-1)?.discountRate || 10 })">＋ 添加等级</el-button><p class="rules-note">退款会退回抵扣积分并冲回相应消费奖励；已使用的优惠券不补发。</p>
      </section>
      <section class="rules-panel"><el-collapse v-model="advanced"><el-collapse-item title="独立钱包与演示设置" name="wallet"><p class="rules-note">商城钱包与点餐钱包独立。当前仅提供模拟余额，不代表实际收款。</p><el-switch :disabled="busy || readonly" v-model="model.walletEnabled" active-text="允许使用商城模拟余额" aria-label="商城模拟钱包" /></el-collapse-item></el-collapse></section>
    </fieldset>
    <footer class="rules-savebar"><div role="status"><strong>{{ readonly ? '当前账号仅可查看' : dirty ? '有修改尚未保存' : '已与保存的规则同步' }}</strong><small v-if="invalid && dirty" class="rules-invalid">{{ invalid }}</small><small v-else>保存后的规则用于后续订单，历史订单保留原规则。</small></div><div><el-button :disabled="busy || readonly || !dirty" @click="discard">放弃修改</el-button><el-button type="primary" native-type="submit" :loading="busy" :disabled="readonly || !dirty || !!invalid">保存规则</el-button></div></footer>
  </el-form>
</template>

<style scoped>
.member-rules-editor{min-width:0}.member-rules-editor fieldset{border:0;padding:0;min-width:0;display:grid;gap:18px}.member-rules-editor fieldset:disabled{opacity:.75}.rules-panel{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:22px}.rules-panel h2{font-size:17px;font-weight:600;color:#1e293b;margin:0}.rules-panel p{font-size:13px;line-height:1.8;color:#64748b;margin:5px 0}.rules-enabled{display:flex;align-items:center;justify-content:space-between;gap:16px}.rules-section-title{display:flex;gap:12px;align-items:start;margin-bottom:20px}.rules-section-title>span{background:#eef2ff;color:#4263eb;border-radius:8px;min-width:33px;line-height:33px;text-align:center;font-size:12px;font-weight:600}.rule-fields,.tier-fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.number-unit{display:flex;align-items:center;gap:8px;width:100%;min-width:0}.number-unit .el-input-number{width:100%;min-width:0}.number-unit>span{font-size:12px;color:#64748b;white-space:nowrap}.member-rules-editor :deep(.el-form-item__content){align-items:start}.member-rules-editor small{display:block;font-size:12px;line-height:1.7;color:#64748b;margin-top:6px}.rule-example{background:#f6f8ff;border:1px solid #e9eefc;padding:14px 16px;border-radius:8px;font-size:13px;color:#475569}.rule-example>strong{font-weight:600}.rule-example a{color:#3458cc;font-size:13px;text-decoration:none}.member-tier-card{border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin-bottom:14px}.tier-index{color:#64748b;font-size:12px;margin-bottom:12px}.member-tier-card footer{border-top:1px solid #edf0f5;padding-top:10px;display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:12px;line-height:1.8;color:#64748b}.member-tier-card footer strong{color:#3458cc;font-size:14px}.rules-note{font-size:12px!important;margin-top:12px!important}.rules-savebar{position:sticky;bottom:-20px;z-index:8;border:1px solid #dce4f2;background:#fffffff5;box-shadow:0 -5px 20px #223c7010;padding:16px 20px;border-radius:10px;display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:18px;backdrop-filter:blur(10px)}.rules-savebar strong{font-size:13px;color:#334155}.rules-savebar small{margin:3px 0 0}.rules-savebar>div:last-child{display:flex;gap:8px;flex-shrink:0}.rules-savebar .el-button+.el-button{margin:0}.rules-savebar .rules-invalid{color:#b45309}.rules-panel :deep(.el-collapse){border:0}.rules-panel :deep(.el-collapse-item__header){border:0;font-size:14px}.rules-panel :deep(.el-collapse-item__wrap){border:0}@media(max-width:1000px){.rule-fields{grid-template-columns:1fr 1fr}.tier-fields{grid-template-columns:1fr}.tier-fields .el-form-item{margin-bottom:12px}}@media(max-width:600px){.rules-panel{padding:16px}.rules-enabled{align-items:start;flex-direction:column}.rule-fields{grid-template-columns:1fr;gap:0}.rules-savebar{bottom:-28px;flex-wrap:wrap;padding:12px}.rules-savebar>div:last-child{width:100%}.rules-savebar .el-button{flex:1}.member-tier-card{padding:12px}.member-tier-card footer{align-items:start;flex-direction:column}}
</style>
