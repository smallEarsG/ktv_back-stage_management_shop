<script setup>
import { computed, ref } from 'vue'
import { amountText as money } from '@/lib/operations'
import OperationsPosterForm from '@/components/OperationsPosterForm.vue'

const props = defineProps({ kind: String, form: Object, skuOptions: Array })
const emit = defineEmits(['poster-uploading'])
const form = computed(() => props.form)
const coupon = computed(() => props.kind === 'coupon')
const gift = computed(() => ['EXCHANGE', 'GIFT'].includes(form.value.type))
const sample = ref(500)
const giftName = id => props.skuOptions.find(s => Number(s.id) === Number(id))?.label || '请选择赠品'
const ruleText = computed(() => coupon.value
  ? [`满 ${money(form.value.threshold)} 元${gift.value ? `兑换 ${giftName(form.value.giftSkuId)} × ${form.value.giftQty || 1}` : `减 ${money(form.value.amount)} 元`}`]
  : (form.value.rules || []).map(r => `满 ${money(r.threshold)} 元${gift.value ? `送 ${giftName(r.giftSkuId)} × ${r.giftQty || 1}` : `减 ${money(r.discount)} 元`}`))
const example = computed(() => {
  if (coupon.value) {
    if (Number(sample.value) < Number(form.value.threshold)) return { label: '未达到使用门槛', payable: Number(sample.value) }
    return { label: gift.value ? `兑换 ${giftName(form.value.giftSkuId)} × ${form.value.giftQty || 1}` : `优惠 ¥${money(Math.min(Number(sample.value), Number(form.value.amount) || 0))}`, payable: gift.value ? Number(sample.value) : Math.max(0, Number(sample.value) - Number(form.value.amount || 0)) }
  }
  const matched = (form.value.rules || []).filter(r => Number(r.threshold) <= Number(sample.value)).sort((a, b) => Number(b.threshold) - Number(a.threshold))[0]
  if (!matched) return { label: '未达到活动门槛', payable: Number(sample.value) }
  return { label: gift.value ? `赠送 ${giftName(matched.giftSkuId)} × ${matched.giftQty || 1}` : `优惠 ¥${money(Math.min(Number(sample.value), Number(matched.discount) || 0))}`, payable: gift.value ? Number(sample.value) : Math.max(0, Number(sample.value) - Number(matched.discount || 0)) }
})
</script>

<template>
  <div class="promotion-layout">
    <div class="form-groups">
      <section class="form-section">
        <div class="section-heading"><span>01</span><div><h3>优惠规则</h3><p>选择优惠类型，设置顾客可获得的权益。</p></div></div>
        <el-form-item :label="coupon ? '优惠券名称' : '活动名称'" required><el-input v-model="form.name" :placeholder="coupon ? '例如：新会员满100减20' : '例如：国庆消费满300减30'" maxlength="64" /></el-form-item>
        <el-form-item label="优惠类型"><el-radio-group v-model="form.type" class="type-options"><el-radio-button :label="coupon ? 'CASH' : 'REDUCE'">{{ coupon ? '满减券' : '满减活动' }}</el-radio-button><el-radio-button :label="coupon ? 'EXCHANGE' : 'GIFT'">{{ coupon ? '菜品兑换券' : '满额送菜' }}</el-radio-button></el-radio-group></el-form-item>
        <template v-if="coupon">
          <el-form-item label="使用门槛" required><el-input-number v-model="form.threshold" :min="0" :precision="2" /><span class="field-unit">元，0 表示无门槛</span></el-form-item>
          <el-form-item v-if="!gift" label="优惠金额" required><el-input-number v-model="form.amount" :min="0.01" :precision="2" /><span class="field-unit">元</span></el-form-item>
          <template v-else><el-form-item label="兑换菜品" required><el-select v-model="form.giftSkuId" filterable placeholder="搜索并选择菜品" class="full-width"><el-option v-for="s in skuOptions" :key="s.id" :value="s.id" :label="s.label" /></el-select></el-form-item><el-form-item label="兑换数量"><el-input-number v-model="form.giftQty" :min="1" :max="100" /><span class="field-unit">份</span></el-form-item></template>
        </template>
        <el-form-item v-else label="活动档位" required>
          <div class="tier-list"><div v-for="(r, i) in form.rules" :key="i" class="tier-row"><span class="tier-number">{{ i + 1 }}</span><div class="tier-fields"><div><span class="input-caption">消费满（元）</span><el-input-number v-model="r.threshold" :min="0" :precision="2" :controls="false" /></div><div v-if="!gift"><span class="input-caption">减免（元）</span><el-input-number v-model="r.discount" :min="0.01" :precision="2" :controls="false" /></div><template v-else><div class="gift-field"><span class="input-caption">赠送菜品</span><el-select v-model="r.giftSkuId" filterable placeholder="选择赠品"><el-option v-for="s in skuOptions" :key="s.id" :value="s.id" :label="s.label" /></el-select></div><div><span class="input-caption">数量</span><el-input-number v-model="r.giftQty" :min="1" :max="100" :controls="false" /></div></template></div><el-button v-if="form.rules.length > 1" link type="danger" @click="form.rules.splice(i, 1)">移除</el-button></div><el-button :disabled="form.rules.length >= 20" class="add-tier" @click="form.rules.push({ threshold: 500, discount: 50, giftQty: 1 })">＋ 增加优惠档位</el-button><p class="field-hint">每笔订单按达到的最高档位计算。</p></div>
        </el-form-item>
      </section>
      <section class="form-section">
        <div class="section-heading"><span>02</span><div><h3>参与范围</h3><p>设置谁可以参加，以及哪些商品适用。</p></div></div>
        <template v-if="!coupon"><el-form-item label="参与顾客"><el-radio-group v-model="form.audience"><el-radio label="ALL">全部顾客</el-radio><el-radio label="MEMBER">本店会员</el-radio></el-radio-group></el-form-item><el-form-item label="适用渠道"><el-select v-model="form.channel" class="full-width"><el-option label="全部渠道" value="ALL" /><el-option label="顾客点单" value="CUSTOMER" /><el-option label="收银台" value="CASHIER" /></el-select></el-form-item></template>
        <el-form-item v-else label="领取方式"><el-switch v-model="form.selfClaim" active-text="顾客可自助领取" /><p class="field-hint full-width">关闭后，仅由门店给会员发券。</p></el-form-item>
        <el-form-item label="适用商品"><el-select v-model="form.skuIds" multiple filterable clearable collapse-tags collapse-tags-tooltip placeholder="全部商品（可选择指定商品）" class="full-width"><el-option v-for="s in skuOptions" :key="s.id" :value="s.id" :label="s.label" /></el-select><p class="field-hint full-width">留空表示全部商品；选择后，门槛仅按所选商品金额计算。</p></el-form-item>
        <el-form-item v-if="!coupon && gift" label="叠加优惠"><el-checkbox v-model="form.stackable">允许与满减活动或优惠券同时使用</el-checkbox></el-form-item>
      </section>
      <section class="form-section">
        <div class="section-heading"><span>03</span><div><h3>时间与限制</h3><p>控制开放时间、数量和每人使用次数。</p></div></div>
        <el-form-item label="开始时间" required><el-date-picker v-model="form.startsAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss" placeholder="选择开始时间" /></el-form-item>
        <el-form-item label="结束时间" required><el-date-picker v-model="form.endsAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss" placeholder="选择结束时间" /></el-form-item>
        <el-form-item v-if="coupon" label="领取后有效"><el-input-number v-model="form.validDays" :min="1" :max="3650" /><span class="field-unit">天</span><p class="field-hint full-width">到期时间不会晚于上方结束时间。</p></el-form-item>
        <el-form-item :label="coupon ? '发行数量' : '活动订单上限'"><el-input-number v-model="form.totalLimit" :min="1" :max="10000000" :precision="0" /><span class="field-unit">{{ coupon ? '张' : '单' }}</span></el-form-item>
        <el-form-item v-if="coupon || form.audience === 'MEMBER'" :label="coupon ? '每人领取上限' : '每人使用上限'"><el-input-number v-model="form.perMemberLimit" :min="coupon ? 1 : 0" :max="coupon ? 1000 : 10000" :precision="0" /><span class="field-unit">{{ coupon ? '张' : '次，0 表示不限' }}</span></el-form-item>
        <el-form-item label="启用状态"><el-switch v-model="form.active" active-text="保存后启用" inactive-text="保存为停用" /></el-form-item>
      </section>
      <section class="form-section">
        <div class="section-heading"><span>04</span><div><h3>活动海报</h3><p>顾客重新进入本店点单时，自动展示你上传的海报。</p></div></div>
        <OperationsPosterForm :poster="form.poster" :coupon="coupon" @uploading="emit('poster-uploading', $event)" />
      </section>
    </div>
    <aside class="promotion-preview" aria-label="优惠规则预览">
      <span class="preview-eyebrow">{{ coupon ? '优惠券预览' : '活动预览' }}</span><h3>{{ form.name || (coupon ? '优惠券名称' : '活动名称') }}</h3>
      <div v-if="coupon" class="coupon-value"><template v-if="!gift"><span>¥</span>{{ money(form.amount) }}</template><template v-else>兑换 {{ form.giftQty || 1 }} 份</template></div>
      <ul class="preview-rules"><li v-for="(text, i) in ruleText" :key="i">{{ text }}</li></ul>
      <div class="preview-scope"><span>{{ coupon ? '本店会员' : form.audience === 'MEMBER' ? '本店会员' : '全部顾客' }}</span><span>{{ form.skuIds?.length ? `指定 ${form.skuIds.length} 个商品规格` : '全部商品' }}</span></div>
      <div class="example"><label>试算适用商品金额</label><el-input-number v-model="sample" :min="0" :precision="2" :controls="false" aria-label="试算适用商品金额" /><div class="example-result"><span>{{ example.label }}</span><div>应付 <strong>¥{{ money(example.payable) }}</strong></div></div></div>
      <p class="preview-note">当前规则预览。实际结算会核对参与范围、有效期及剩余名额。</p><p v-if="!gift" class="preview-note">同一订单内，满减活动与一张优惠券互斥。</p><p v-else class="preview-note">赠品以零元加入订单，退款按实付金额计算。</p>
      <div v-if="form.poster?.enabled" class="poster-live-preview"><span class="preview-eyebrow">顾客弹窗预览</span><div class="poster-phone"><img v-if="form.poster.imageUrl" :src="form.poster.imageUrl" alt="顾客看到的海报" /><span v-else>上传图片后显示海报</span><strong>{{ form.poster.buttonText || (coupon ? '领取优惠券' : '查看活动') }}</strong><small>关闭后继续点单 · 再次进入重新弹出</small></div></div>
    </aside>
  </div>
</template>

<style scoped>
.promotion-layout{display:grid;grid-template-columns:minmax(0,1fr) 260px;gap:24px;align-items:start}.form-groups{display:flex;flex-direction:column;gap:18px}.form-section{padding:20px 18px 4px;border:1px solid #e2e8f0;border-radius:12px;background:#fff}.section-heading{display:flex;gap:12px;align-items:flex-start;margin-bottom:22px}.section-heading>span{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;background:#eff6ff;color:#2563eb;font-size:12px;font-weight:700}.section-heading h3{font-size:15px;font-weight:650;color:#0f172a;line-height:22px}.section-heading p,.field-hint{font-size:12px;color:#64748b;line-height:1.7}.section-heading p{margin-top:3px}.field-hint{margin-top:8px}.field-unit{font-size:12px;color:#64748b;margin-left:10px}.full-width{width:100%}.tier-list{width:100%}.tier-row{display:flex;gap:10px;align-items:center;margin-bottom:12px;background:#f8fafc;border:1px solid #e2e8f0;padding:12px;border-radius:9px}.tier-number{width:22px;height:22px;flex-shrink:0;display:grid;place-items:center;background:#dbeafe;color:#2563eb;font-size:12px;border-radius:50%}.tier-fields{display:flex;flex-wrap:wrap;gap:10px;flex:1;min-width:0}.input-caption{display:block;font-size:11px;color:#64748b;line-height:18px;margin-bottom:5px}.tier-fields .el-input-number{width:112px}.gift-field{min-width:130px;flex:1}.gift-field .el-select{width:100%}.add-tier{width:100%;border-style:dashed;color:#2563eb}.promotion-preview{position:sticky;top:0;padding:22px;border-radius:14px;background:linear-gradient(145deg,#eff6ff,#f8fafc 65%);border:1px solid #dbeafe}.preview-eyebrow{font-size:11px;color:#2563eb;font-weight:600;letter-spacing:1px}.promotion-preview h3{font-size:18px;font-weight:650;line-height:1.5;color:#0f172a;margin-top:10px;overflow-wrap:anywhere}.coupon-value{font-size:36px;font-weight:750;letter-spacing:-1px;color:#2563eb;margin-top:14px}.coupon-value>span{font-size:18px;margin-right:4px}.preview-rules{margin-top:18px;display:flex;flex-direction:column;gap:10px}.preview-rules li{font-size:13px;font-weight:600;line-height:1.7;color:#1e40af}.preview-scope{margin-top:16px;display:flex;gap:6px;flex-wrap:wrap}.preview-scope span{font-size:11px;padding:3px 8px;border-radius:5px;background:#fff;border:1px solid #dbeafe;color:#475569}.example{margin-top:24px;padding-top:20px;border-top:1px dashed #cbd5e1}.example label{display:block;font-size:12px;color:#64748b;margin-bottom:10px}.example .el-input-number{width:100%}.example-result{margin-top:14px;font-size:12px;color:#2563eb;line-height:1.8}.example-result>div{margin-top:5px;color:#475569}.example-result strong{font-size:23px;font-weight:750;color:#0f172a}.preview-note{font-size:11px;line-height:1.8;color:#64748b;margin-top:16px}@media(max-width:850px){.promotion-layout{grid-template-columns:1fr}.promotion-preview{position:static;order:-1}.example{display:none}.promotion-preview{padding:16px}.preview-rules{margin-top:10px}.preview-note{margin-top:8px}}@media(max-width:600px){.form-section{padding:16px 10px 0}.tier-row{padding:9px;gap:6px}.tier-fields .el-input-number{width:100px}.field-unit{margin-left:6px}}
@media(max-width:600px){.form-section :deep(.el-form-item){display:block}.form-section :deep(.el-form-item__label){width:auto!important;display:flex;height:auto;line-height:20px;padding-bottom:6px}.form-section :deep(.el-form-item__content){margin-left:0!important}.form-section :deep(.el-date-editor.el-input){width:100%}}
.poster-live-preview{margin-top:22px;padding-top:20px;border-top:1px dashed #cbd5e1}.poster-phone{margin-top:12px;padding:12px;background:#fff;border-radius:12px;text-align:center;border:1px solid #dbeafe}.poster-phone img{width:100%;max-height:270px;object-fit:contain;border-radius:8px}.poster-phone>span{display:block;padding:40px 8px;color:#94a3b8;font-size:12px}.poster-phone strong{display:block;background:#2563eb;color:#fff;border-radius:8px;padding:10px;margin-top:10px;font-size:12px}.poster-phone small{display:block;font-size:10px;line-height:1.7;color:#94a3b8;margin-top:10px}
</style>
