<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Calendar, Refresh, ArrowRight } from '@element-plus/icons-vue'
import request from '@/lib/request'
import { birthdayCountdown, birthdayScopes, birthdayText } from '@/lib/birthdays'
const props = defineProps({ revision: { type: Number, default: 0 }, selected: { type: String, default: '' }, showList: { type: Boolean, default: false } })
const emit = defineEmits(['select', 'inspect'])
const result = ref(null), loading = ref(false), error = ref('')
let generation = 0
async function load() {
  const version = ++generation; loading.value = true; error.value = ''
  try { const data = await request.get('/operations/member-birthdays', { params: { scope: 'NEXT7', page: 1, size: 5 }, silent: true }); if (version === generation) result.value = data }
  catch (e) { if (version === generation) error.value = e.message || '生日提醒暂未加载' }
  finally { if (version === generation) loading.value = false }
}
watch(() => props.revision, load)
onMounted(load); onBeforeUnmount(() => { generation++ })
</script>
<template>
  <section class="birthday-panel" aria-label="会员生日提醒">
    <div class="birthday-heading"><div class="birthday-title"><span class="calendar-icon"><el-icon><Calendar /></el-icon></span><div><h2>会员生日</h2><p>提前记住顾客的重要日子</p></div></div><div class="birthday-heading-actions"><button type="button" class="all-members" :class="{ selected: selected === '' }" :aria-pressed="selected === ''" @click="emit('select', '')">全部会员<el-icon><ArrowRight /></el-icon></button><el-button :icon="Refresh" :loading="loading" text circle aria-label="刷新生日" title="刷新生日" @click="load" /></div></div>
    <el-alert v-if="error" :title="error" type="warning" :closable="false" class="mb-3" />
    <div class="birthday-filters"><button v-for="scope in birthdayScopes.filter(item => item.count)" :key="scope.value" type="button" :class="{ selected: selected === scope.value, 'today-filter': scope.value === 'TODAY' }" :aria-pressed="selected === scope.value" @click="emit('select', scope.value)"><span>{{ scope.label }}</span><div><strong>{{ result && !error ? result.counts[scope.count] ?? '—' : '—' }}</strong><small>人</small><el-icon><ArrowRight /></el-icon></div></button></div>
    <template v-if="showList && result && !error"><div v-if="result.list.length" class="birthday-list"><button v-for="member in result.list" :key="member.id" type="button" @click="emit('inspect', member)"><span><strong>{{ member.name }}</strong><small>{{ birthdayText(member.birthday) }}</small></span><span :class="{ today: member.daysUntilBirthday === 0 }">{{ birthdayCountdown(member) }}</span></button></div><p v-else class="birthday-empty">近7天暂无会员生日，可以先在会员资料中登记。</p></template>
    <p class="birthday-note">仅统计本店正常会员 · 按北京时间、公历生日提醒 · 近7天含今天及未来7天</p>
  </section>
</template>
<style scoped>
.birthday-panel { margin-bottom: 20px; padding: 22px 24px 16px; border: 1px solid #e2e8f0; border-radius: 14px; background: #fff; }
.birthday-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 20px; }
.birthday-title,.birthday-heading-actions { display: flex; align-items: center; gap: 12px; }
.calendar-icon { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 11px; background: #eff6ff; color: #2563eb; font-size: 19px; }
.birthday-heading h2 { font-size: 15px; font-weight: 650; color: #0f172a; }
.birthday-heading p,.birthday-note,.birthday-empty { margin-top: 4px; color: #94a3b8; font-size: 11px; }
.all-members { display: inline-flex; align-items: center; gap: 5px; padding: 6px 0; border: 0; background: transparent; font-size: 12px; color: #64748b; cursor: pointer; white-space: nowrap; }
.all-members.selected,.all-members:hover { color: #2563eb; }
.all-members.selected { font-weight: 600; }
.birthday-heading-actions { gap: 10px; }
.birthday-filters { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 12px; }
.birthday-filters button { min-width: 0; padding: 14px 16px; border: 1px solid #e8edf3; border-radius: 10px; background: #f8fafc; text-align: left; cursor: pointer; transition: border-color .15s,background .15s; }
.birthday-filters button>span { color: #64748b; font-size: 12px; }
.birthday-filters button>div { display: flex; align-items: baseline; gap: 5px; margin-top: 8px; }
.birthday-filters strong { color: #1e293b; font-size: 26px; font-weight: 650; line-height: 1.3; font-variant-numeric: tabular-nums; }
.birthday-filters small { color: #94a3b8; font-size: 11px; }
.birthday-filters .el-icon { margin-left: auto; align-self: center; color: #cbd5e1; font-size: 13px; }
.birthday-filters button:hover { border-color: #bfdbfe; background: #f3f7ff; }
.birthday-filters button.selected { border-color: #93c5fd; background: #eff6ff; box-shadow: inset 0 0 0 1px #bfdbfe; }
.birthday-filters button.selected>span,.birthday-filters button.selected strong,.birthday-filters button.selected .el-icon { color: #2563eb; }
.birthday-filters .today-filter strong { color: #b45309; }
.birthday-filters button:focus-visible,.all-members:focus-visible { outline: 2px solid #2563eb; outline-offset: 3px; }
.birthday-list { margin: 14px 0; display: grid; gap: 8px; }
.birthday-list button { display: flex; justify-content: space-between; gap: 12px; padding: 10px 12px; border: 1px solid #edf1f5; border-radius: 8px; background: white; text-align: left; font-size: 13px; }
.birthday-list button>span:first-child { min-width: 0; overflow-wrap: anywhere; }
.birthday-list button>span:last-child { flex-shrink: 0; align-self: center; color: #64748b; font-size: 12px; }
.birthday-list small { display: block; margin-top: 3px; color: #94a3b8; }
.birthday-list button>span.today { color: #b74e15; font-weight: 600; }
.birthday-empty { padding: 12px 0; }
.birthday-note { margin-top: 12px; line-height: 1.7; }
@media (max-width: 750px) {
  .birthday-panel { padding: 17px 16px 13px; }
  .birthday-heading { margin-bottom: 16px; gap: 8px; }
  .birthday-title { gap: 9px; }
  .birthday-heading p { display: none; }
  .calendar-icon { width: 32px; height: 32px; font-size: 17px; border-radius: 9px; }
  .birthday-filters { grid-template-columns: repeat(2,minmax(0,1fr)); gap: 9px; }
  .birthday-filters button { padding: 12px 13px; }
  .birthday-filters strong { font-size: 23px; }
  .birthday-heading-actions { gap: 3px; }
  .birthday-note { font-size: 10px; }
}
</style>
