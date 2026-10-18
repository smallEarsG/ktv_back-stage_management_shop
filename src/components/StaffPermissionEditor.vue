<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { businessLabels } from '@/lib/business'
import { permissionCatalog, roleTemplates, templatePermissions, toV2Permissions, normalizePermissions, hasAction } from '@/lib/permissions'
import { visibleNavigation } from '@/lib/navigation'

const props = defineProps({
  staff: { type: Object, required: true },
  availableBusinesses: { type: Array, default: () => [] },
  saving: { type: Boolean, default: false }
})
const emit = defineEmits(['save', 'close'])
const businesses = ref([]), draft = ref([]), initial = ref([]), templateId = ref(''), loadError = ref('')
const legacy = computed(() => !Array.isArray(props.staff.permissions) || !props.staff.permissions.includes('permissions:v2'))
const tokenFor = item => `${item.business}:${item.action}`
const sameTokens = (left, right) => JSON.stringify([...left].sort()) === JSON.stringify([...right].sort())
const dirty = computed(() => !sameTokens(draft.value, initial.value))
const availableCatalog = computed(() => permissionCatalog.filter(item =>
  (item.business === 'COMMON' || businesses.value.includes(item.business)) &&
  (!item.requiresBusinesses || item.requiresBusinesses.every(type => businesses.value.includes(type)))
))
const selectedActions = computed(() => availableCatalog.value.filter(item => draft.value.includes(tokenFor(item))))
const sensitiveActions = computed(() => selectedActions.value.filter(item => item.sensitive))
const addedActions = computed(() => selectedActions.value.filter(item => !initial.value.includes(tokenFor(item))))
const removedActions = computed(() => permissionCatalog.filter(item => initial.value.includes(tokenFor(item)) && !draft.value.includes(tokenFor(item))))
const businessSections = computed(() => [...businesses.value, 'COMMON'].map(business => {
  const items = availableCatalog.value.filter(item => item.business === business)
  return {
    business,
    label: business === 'COMMON' ? '公共管理' : businessLabels[business],
    groups: [...new Set(items.map(item => item.group))].map(label => ({ label, items: items.filter(item => item.group === label) }))
  }
}).filter(section => section.groups.length))
const navigationPreview = computed(() => visibleNavigation(
  type => businesses.value.includes(type),
  (permission, business) => hasAction('staff', draft.value, business || 'COMMON', permission)
))

watch(() => props.staff, () => {
  loadError.value = ''; templateId.value = ''
  const previous = Array.isArray(props.staff.permissions) ? props.staff.permissions : []
  businesses.value = props.availableBusinesses.filter(type => !previous.includes('business:scoped') || previous.includes(`business:${type}`))
  try {
    if (legacy.value && previous.some(token => !token.startsWith('business:') && !permissionCatalog.some(item => item.legacy.includes(token)))) throw new Error('Unrecognized legacy grant')
    draft.value = toV2Permissions(previous, businesses.value); initial.value = [...draft.value]
  }
  catch { draft.value = []; initial.value = []; loadError.value = '该员工存在无法识别的历史权限。请保留现有配置并联系平台处理，避免覆盖原有权限。' }
}, { immediate: true })

function dependencySources(item) {
  return selectedActions.value.filter(other => other !== item && (other.dependsOn || []).some(dependency =>
    (dependency.startsWith('DINING:') || dependency.startsWith('MALL:') || dependency.startsWith('COMMON:') ? dependency : `${other.business}:${dependency}`) === tokenFor(item)
  )).map(other => other.label)
}
function updatePermission(item, checked) {
  if (props.saving || loadError.value) return
  const token = tokenFor(item)
  draft.value = normalizePermissions(checked ? [...draft.value, token] : draft.value.filter(value => value !== token), businesses.value)
  templateId.value = ''
}
async function changeBusinesses(next) {
  if (props.saving || loadError.value) return
  const removed = selectedActions.value.filter(item => (item.business !== 'COMMON' && !next.includes(item.business)) || (item.requiresBusinesses || []).some(type => !next.includes(type)))
  if (removed.length) {
    try { await ElMessageBox.confirm(`调整业务后，将移除不适用于新业务范围的 ${removed.length} 项操作权限。确认继续？`, '调整业务范围', { type: 'warning', confirmButtonText: '确认调整', cancelButtonText: '保留当前范围' }) }
    catch { businesses.value = [...businesses.value]; return }
  }
  const removedTokens = removed.map(tokenFor)
  const nextDraft = normalizePermissions(draft.value.filter(token => !removedTokens.includes(token)), next)
  businesses.value = [...next]
  draft.value = nextDraft
  templateId.value = ''
}
function templateEnabled(template) {
  if (template.id === 'kitchen' || template.id === 'cashier') return businesses.value.includes('DINING')
  if (template.id === 'fulfillment') return businesses.value.includes('MALL')
  return businesses.value.length > 0
}
async function applyTemplate() {
  const template = roleTemplates.find(item => item.id === templateId.value)
  if (!template || !templateEnabled(template) || props.saving) return
  try {
    await ElMessageBox.confirm(`将使用“${template.label}”替换当前勾选的操作权限，业务范围保持当前选择。该账号仍为员工，可在应用后继续微调。`, '应用岗位模板', { confirmButtonText: '应用模板', cancelButtonText: '取消', type: 'warning' })
    draft.value = templatePermissions(template.id, businesses.value)
  } catch { /* Cancel preserves the current grants. */ }
}
async function confirmDiscard() {
  if (props.saving) return false
  if (!dirty.value) return true
  try { await ElMessageBox.confirm('当前权限调整尚未保存，确定放弃？', '未保存的权限', { confirmButtonText: '放弃修改', cancelButtonText: '继续编辑', type: 'warning' }); return true }
  catch { return false }
}
async function close() { if (await confirmDiscard()) emit('close') }
function save() {
  if (props.saving || loadError.value) return
  try { emit('save', normalizePermissions(draft.value, businesses.value)) }
  catch { ElMessage.error('权限配置校验未通过，请检查后重新保存') }
}
defineExpose({ confirmDiscard })
</script>

<template>
  <div class="staff-permissions">
    <div class="permission-intro"><div><strong>{{ staff.name || staff.nickname || staff.username }}</strong><span>{{ staff.username }} · 员工账号</span></div><el-tag effect="plain">按业务独立授权</el-tag></div>
    <el-alert v-if="loadError" :title="loadError" type="error" :closable="false" show-icon />
    <el-alert v-else-if="legacy" title="原有操作权限已按业务展开，并补齐所需的查看权限。门店资料、员工授权和支付配置由老板管理，历史宽泛授权不再包含这些修改操作。请核对预览后保存，岗位模板需点击应用才会替换权限。" type="info" :closable="false" show-icon />
    <div class="permission-layout">
      <div class="permission-main">
        <section class="permission-card">
          <div class="permission-heading"><h3>1. 选择负责的业务</h3><span>仅可选择本店已开通的产品</span></div>
          <el-checkbox-group :model-value="businesses" :disabled="saving || !!loadError" @update:model-value="changeBusinesses"><el-checkbox v-for="business in availableBusinesses" :key="business" :label="business" border>{{ businessLabels[business] }}</el-checkbox></el-checkbox-group>
          <p v-if="!businesses.length" class="permission-hint">尚未分配业务。员工只可访问已勾选的公共功能、账号安全和已购服务。</p>
        </section>
        <section class="permission-card">
          <div class="permission-heading"><h3>2. 选择岗位模板</h3><span>应用后仍可逐项微调</span></div>
          <div class="template-controls"><el-select v-model="templateId" placeholder="选择一个岗位" :disabled="saving || !businesses.length || !!loadError" aria-label="岗位模板"><el-option v-for="template in roleTemplates" :key="template.id" :value="template.id" :label="template.label" :disabled="!templateEnabled(template)" /></el-select><el-button :disabled="saving || !templateId || !!loadError" @click="applyTemplate">应用模板</el-button></div>
          <p class="permission-hint">{{ roleTemplates.find(item => item.id === templateId)?.description || '先选择业务，再选择岗位。店长模板仍为受控员工，不会获得老板账号的授权权限。' }}</p>
        </section>
        <section class="permission-card">
          <div class="permission-heading"><h3>3. 设置可执行操作</h3><span>已选 {{ selectedActions.length }} 项</span></div>
          <p class="permission-hint">编辑、发货等操作会自动补齐所需的查看权限；先取消对应操作，才能取消其依赖权限。</p>
          <div v-for="section in businessSections" :key="section.business" class="permission-business">
            <h4>{{ section.label }}</h4>
            <div v-for="group in section.groups" :key="group.label" class="permission-group">
              <h5>{{ group.label }}</h5>
              <div class="permission-options"><div v-for="item in group.items" :key="tokenFor(item)" class="permission-option"><el-checkbox :model-value="draft.includes(tokenFor(item))" :disabled="saving || !!loadError || dependencySources(item).length > 0" @update:model-value="checked => updatePermission(item, checked)"><span>{{ item.label }}</span><span v-if="item.sensitive" class="sensitive-marker">敏感</span></el-checkbox><small v-if="dependencySources(item).length">{{ dependencySources(item).join('、') }}所需</small></div></div>
            </div>
          </div>
          <p v-if="businesses.length === 1" class="permission-hint">商品与库存共享需要同时负责点餐和商城，当前不开放该项。</p>
        </section>
      </div>
      <aside class="permission-preview" aria-label="权限效果预览">
        <section class="permission-card"><div class="permission-heading"><h3>员工可见菜单</h3><el-tag size="small" type="info">实时预览</el-tag></div><p class="permission-hint">保存后按最新授权显示菜单，已收回的操作会立即被后台拒绝。</p><div v-for="menu in navigationPreview" :key="menu.path" class="preview-group"><strong>{{ menu.label }}</strong><ul v-if="menu.children"><li v-for="child in menu.children" :key="child.path">{{ child.label }}</li></ul></div></section>
        <section class="permission-card"><div class="permission-heading"><h3>敏感操作</h3><span>{{ sensitiveActions.length }} 项</span></div><ul v-if="sensitiveActions.length" class="sensitive-list"><li v-for="item in sensitiveActions" :key="tokenFor(item)">{{ businessLabels[item.business] || '公共管理' }} · {{ item.label }}</li></ul><p v-else class="permission-hint">未开放敏感操作</p></section>
        <section v-if="dirty" class="permission-card permission-changes"><h3>本次调整</h3><p>新增 {{ addedActions.length }} 项，移除 {{ removedActions.length }} 项</p><p v-if="addedActions.length"><strong>新增：</strong>{{ addedActions.map(item => `${businessLabels[item.business] || '公共'}${item.label}`).join('、') }}</p><p v-if="removedActions.length"><strong>移除：</strong>{{ removedActions.map(item => `${businessLabels[item.business] || '公共'}${item.label}`).join('、') }}</p></section>
      </aside>
    </div>
    <div class="permission-footer"><span>{{ dirty ? '有未保存的权限调整' : legacy ? '原有权限已展开，保存后启用独立授权' : '权限已按业务独立设置' }}</span><div><el-button :disabled="saving" @click="close">取消</el-button><el-button type="primary" :loading="saving" :disabled="!!loadError" @click="save">保存权限</el-button></div></div>
  </div>
</template>

<style scoped>
.staff-permissions{color:#334155;font-size:14px}.permission-intro{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:16px}.permission-intro strong{display:block;font-size:17px;color:#0f172a}.permission-intro span{display:block;font-size:13px;color:#64748b;margin-top:4px}.permission-layout{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:20px;margin-top:20px}.permission-main,.permission-preview{min-width:0}.permission-card{border:1px solid #e2e8f0;border-radius:12px;padding:18px;margin-bottom:16px;background:white}.permission-heading{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px}.permission-heading h3,.permission-changes h3{margin:0;color:#0f172a;font-size:15px;font-weight:600}.permission-heading>span{font-size:12px;color:#64748b}.permission-hint{font-size:13px;line-height:1.7;color:#64748b;margin:10px 0 0}.template-controls{display:flex;gap:10px}.template-controls .el-select{flex:1;min-width:0}.permission-business{margin-top:22px}.permission-business h4{font-size:15px;margin:0 0 14px;color:#1d4ed8}.permission-group+.permission-group{margin-top:16px;padding-top:16px;border-top:1px solid #f1f5f9}.permission-group h5{font-size:13px;font-weight:600;color:#475569;margin:0 0 8px}.permission-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 12px}.permission-option{min-width:0}.permission-option :deep(.el-checkbox){height:auto;min-height:32px;margin-right:0;white-space:normal}.permission-option :deep(.el-checkbox__label){font-size:14px;display:inline-flex;align-items:center;gap:6px;white-space:normal;line-height:1.5}.permission-option small{display:block;padding-left:24px;color:#64748b;font-size:12px;line-height:1.5}.sensitive-marker{display:inline-block;padding:1px 5px;border-radius:4px;background:#fff7ed;color:#b45309;font-size:11px;white-space:nowrap}.preview-group{margin-top:16px;font-size:13px}.preview-group strong{font-size:14px;color:#334155}.preview-group ul,.sensitive-list{list-style:none;padding:0;margin:8px 0 0}.preview-group li{padding:5px 0 5px 12px;border-left:2px solid #e2e8f0;color:#64748b}.sensitive-list li{padding:6px 0;color:#9a3412;line-height:1.6;font-size:13px}.permission-changes p{font-size:13px;line-height:1.7;overflow-wrap:anywhere}.permission-footer{position:sticky;bottom:0;z-index:2;background:rgba(255,255,255,.98);border-top:1px solid #e2e8f0;padding:16px 0 10px;display:flex;justify-content:space-between;align-items:center;gap:16px}.permission-footer>span{font-size:12px;color:#64748b}.permission-footer>div{display:flex;flex-shrink:0;gap:8px}.permission-footer :deep(.el-button+.el-button){margin-left:0}@media(max-width:760px){.permission-layout{grid-template-columns:1fr;gap:0}.permission-intro{align-items:flex-start}.permission-card{padding:15px}.permission-heading{align-items:flex-start}.permission-options{grid-template-columns:1fr}.permission-preview{display:grid;grid-template-columns:1fr;gap:0}.permission-footer{bottom:0;align-items:flex-start;flex-direction:column;gap:10px}.permission-footer>div{width:100%;justify-content:flex-end}.permission-intro>.el-tag{flex-shrink:0}}
</style>
