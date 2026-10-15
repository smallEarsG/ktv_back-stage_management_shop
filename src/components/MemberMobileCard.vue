<script setup>
import { computed } from 'vue'
import { Calendar, Present } from '@element-plus/icons-vue'
import { birthdayCountdown, birthdayText } from '@/lib/birthdays'
import { amountText } from '@/lib/operations'
import MemberActions from '@/components/MemberActions.vue'

const props = defineProps({
  member: { type: Object, required: true },
  admin: { type: Boolean, default: false },
  financialBlocked: { type: Boolean, default: false },
})
const emit = defineEmits(['detail', 'recharge', 'issue', 'edit'])
const active = computed(() => props.member.status === 'ACTIVE')
const registeredBirthday = computed(() => birthdayText(props.member.birthday) !== '未登记')
const todayBirthday = computed(() => active.value && registeredBirthday.value && props.member.daysUntilBirthday != null && Number(props.member.daysUntilBirthday) === 0)
const birthdayNotice = computed(() => active.value && registeredBirthday.value ? birthdayCountdown(props.member) : '')
const joinedDate = computed(() => props.member.createdAt ? String(props.member.createdAt).slice(0, 10) : '—')
const balance = computed(() => amountText(Number(props.member.principal || 0) + Number(props.member.bonus || 0)))
</script>

<template>
  <article class="member-card" :aria-label="`${member.name || '会员'}的会员资料`">
    <header class="member-identity">
      <span class="member-avatar" aria-hidden="true">{{ Array.from(member.name || '会')[0] }}</span>
      <div class="member-contact"><h3 :title="member.name">{{ member.name || '未填写姓名' }}</h3><p :title="member.phone || ''">{{ member.phone || '未绑定手机号' }}</p></div>
      <span class="member-status" :class="{ inactive: !active }"><i aria-hidden="true" />{{ active ? '正常' : '已停用' }}</span>
    </header>
    <div class="member-values">
      <div class="wallet-value"><span class="value-label">钱包余额</span><strong><small>¥</small>{{ balance }}</strong><p>本金 {{ amountText(member.principal) }}<span>·</span>赠金 {{ amountText(member.bonus) }}</p></div>
      <div class="consumption-value"><span class="value-label">累计消费</span><strong>¥{{ amountText(member.consumption) }}</strong><p>{{ Number(member.orderCount || 0) }} 笔订单</p></div>
    </div>
    <div class="member-birthday" :class="{ 'birthday-today': todayBirthday }">
      <span class="birthday-label"><el-icon><Present /></el-icon>生日</span>
      <template v-if="registeredBirthday"><span class="birthday-date">{{ birthdayText(member.birthday) }}</span><span v-if="birthdayNotice" class="birthday-countdown">{{ birthdayNotice }}</span></template>
      <button v-else-if="admin" type="button" class="birthday-register" @click="emit('edit')">登记生日<span aria-hidden="true"> +</span></button>
      <span v-else class="birthday-missing">未登记</span>
    </div>
    <footer class="member-footer">
      <span class="join-date"><el-icon><Calendar /></el-icon>{{ joinedDate }} 加入</span>
      <MemberActions :member="member" :admin="admin" :financial-blocked="financialBlocked" @detail="emit('detail')" @recharge="emit('recharge')" @issue="emit('issue')" @edit="emit('edit')" />
    </footer>
  </article>
</template>

<style scoped>
.member-card { min-width: 0; padding: 18px; border: 1px solid #e2e8f0; border-radius: 12px; background: #fff; color: #334155; }
.member-identity { display: flex; align-items: center; gap: 11px; min-width: 0; }
.member-avatar { display: grid; place-items: center; flex: 0 0 40px; width: 40px; height: 40px; border-radius: 12px; background: #eff6ff; color: #2563eb; font-size: 17px; font-weight: 600; }
.member-contact { flex: 1; min-width: 0; }
.member-contact h3, .member-contact p { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.member-contact h3 { margin: 0; color: #0f172a; font-size: 15px; font-weight: 600; line-height: 1.5; }
.member-contact p { margin: 3px 0 0; font-size: 12px; color: #64748b; font-variant-numeric: tabular-nums; }
.member-status { display: inline-flex; align-items: center; gap: 5px; flex-shrink: 0; font-size: 11px; color: #475569; }
.member-status i { width: 5px; height: 5px; border-radius: 50%; background: #3b82f6; }
.member-status.inactive { color: #94a3b8; }
.member-status.inactive i { background: #94a3b8; }
.member-values { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 14px; margin: 20px 0 17px; }
.member-values > div { min-width: 0; }
.value-label { display: block; margin-bottom: 6px; color: #64748b; font-size: 11px; }
.member-values strong { display: block; color: #0f172a; font-size: 22px; line-height: 1.4; font-weight: 650; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.wallet-value strong small { margin-right: 3px; font-size: 13px; font-weight: 500; }
.member-values .consumption-value strong { padding-top: 4px; font-size: 17px; }
.member-values p { margin: 5px 0 0; color: #64748b; font-size: 10px; line-height: 1.7; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.wallet-value p span { margin: 0 5px; color: #cbd5e1; }
.member-birthday { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 10px 11px; border: 1px solid #edf1f5; border-radius: 8px; background: #f8fafc; font-size: 12px; line-height: 1.6; }
.birthday-label { display: inline-flex; align-items: center; gap: 5px; color: #64748b; }
.birthday-label .el-icon { font-size: 14px; }
.birthday-date { font-weight: 500; color: #475569; }
.birthday-countdown { margin-left: auto; color: #64748b; font-size: 11px; }
.birthday-today { border-color: #fed7aa; background: #fffaf4; }
.birthday-today .birthday-countdown { color: #b45309; font-weight: 600; }
.birthday-register { padding: 0 2px; border: 0; border-radius: 3px; background: transparent; color: #2563eb; font-size: 12px; line-height: 1.6; cursor: pointer; }
.birthday-register:hover { text-decoration: underline; }
.birthday-register:focus-visible { outline: 2px solid #2563eb; outline-offset: 3px; }
.birthday-missing { color: #94a3b8; }
.member-footer { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px; margin-top: 15px; padding-top: 14px; border-top: 1px solid #f1f5f9; }
.join-date { display: inline-flex; align-items: center; gap: 5px; color: #94a3b8; font-size: 10px; white-space: nowrap; }
.member-footer :deep(.member-actions) { margin-left: auto; }
@media (max-width: 360px) {
  .member-card { padding: 15px; }
  .member-values { gap: 10px; }
  .member-values strong { font-size: 20px; }
  .member-values .consumption-value strong { font-size: 16px; }
  .birthday-countdown { font-size: 10px; }
}
</style>
