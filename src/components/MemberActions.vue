<script setup>
import { computed } from 'vue'
import { ArrowDown } from '@element-plus/icons-vue'

const props = defineProps({
  member: { type: Object, required: true },
  admin: { type: Boolean, default: false },
  financialBlocked: { type: Boolean, default: false },
  canEdit: { type: Boolean, default: undefined },
  canTopup: { type: Boolean, default: undefined },
  canIssue: { type: Boolean, default: undefined },
})
const mayEdit = computed(() => props.canEdit ?? props.admin)
const mayTopup = computed(() => props.canTopup ?? props.admin)
const mayIssue = computed(() => props.canIssue ?? props.admin)
const emit = defineEmits(['detail', 'recharge', 'issue', 'edit'])
const active = computed(() => props.member.status === 'ACTIVE')
const rechargeHint = computed(() => !active.value ? '会员已停用，无法充值' : props.financialBlocked ? '请先处理原资金操作，再为会员充值' : '为会员充值')
function command(value) {
  if (value === 'issue' && mayIssue.value && active.value) emit('issue')
  if (value === 'edit' && mayEdit.value) emit('edit')
}
</script>

<template>
  <div class="member-actions">
    <el-button class="detail-button" type="primary" plain size="small" :aria-label="`查看${member.name || '会员'}详情`" @click="emit('detail')">详情</el-button>
    <el-button v-if="mayTopup" class="recharge-button" link type="primary" size="small" :disabled="!active || financialBlocked" :title="rechargeHint" @click="emit('recharge')">充值</el-button>
    <el-dropdown v-if="mayEdit || mayIssue" trigger="click" placement="bottom-end" @command="command">
      <el-button class="more-button" text size="small" :aria-label="`${member.name || '会员'}的更多操作`">更多<el-icon class="more-arrow"><ArrowDown /></el-icon></el-button>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item v-if="mayIssue" command="issue" :disabled="!active">发放优惠券</el-dropdown-item>
          <el-dropdown-item v-if="mayEdit" command="edit">编辑会员资料</el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>

<style scoped>
.member-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; min-width: 0; }
.member-actions .el-button + .el-button { margin-left: 0; }
.detail-button { min-height: 30px; padding: 0 12px; border-color: #dbeafe; background: #f8fbff; font-weight: 500; }
.detail-button:hover { border-color: #93c5fd; background: #eff6ff; }
.recharge-button { padding: 4px 2px; min-height: 30px; font-weight: 500; }
.more-button { min-height: 30px; padding: 0 5px; color: #64748b; }
.more-arrow { margin-left: 4px; font-size: 11px; }
.member-actions :deep(.el-button:focus-visible) { outline: 2px solid #2563eb; outline-offset: 3px; }
@media (max-width: 750px) {
  .member-actions { gap: 14px; }
  .detail-button, .recharge-button, .more-button { min-height: 34px; }
}
</style>
