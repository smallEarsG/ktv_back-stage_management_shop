<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
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
    <div class="birthday-heading"><div><h2>会员生日</h2><p>按北京时间提醒，仅统计本店正常会员</p></div><el-button :loading="loading" @click="load">刷新生日</el-button></div>
    <el-alert v-if="error" :title="error" type="warning" :closable="false" class="mb-3" />
    <div class="birthday-filters"><button v-for="scope in birthdayScopes" :key="scope.value" type="button" :class="{ selected: selected === scope.value }" @click="emit('select', scope.value)">{{ scope.label }}<strong v-if="scope.count">{{ result && !error ? result.counts[scope.count] ?? '—' : '—' }}</strong></button></div>
    <template v-if="showList && result && !error"><div v-if="result.list.length" class="birthday-list"><button v-for="member in result.list" :key="member.id" type="button" @click="emit('inspect', member)"><span><strong>{{ member.name }}</strong><small>{{ birthdayText(member.birthday) }}</small></span><span :class="{ today: member.daysUntilBirthday === 0 }">{{ birthdayCountdown(member) }}</span></button></div><p v-else class="birthday-empty">近7天暂无会员生日，可以先在会员资料中登记。</p></template>
    <p class="birthday-note">近7天包含今天及未来7天。未登记生日不参与生日名单；可从会员详情手动发放现有优惠券。</p>
  </section>
</template>
<style scoped>
.birthday-panel { margin-bottom: 20px; padding: 20px; border: 1px solid #f4d7aa; border-radius: 16px; background: #fffdf8; }
.birthday-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.birthday-heading h2 { font-size: 17px; font-weight: 650; color: #70421b; }
.birthday-heading p,.birthday-note,.birthday-empty { margin-top: 5px; color: #7c7367; font-size: 12px; }
.birthday-filters { display: flex; flex-wrap: wrap; gap: 8px; }
.birthday-filters button { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border: 1px solid #e7dfd4; border-radius: 9px; background: white; font-size: 13px; }
.birthday-filters button.selected { color: #9a4d0b; border-color: #d99352; background: #fff0dc; }
.birthday-filters strong { font-variant-numeric: tabular-nums; }
.birthday-list { margin: 14px 0; display: grid; gap: 8px; }
.birthday-list button { display: flex; justify-content: space-between; gap: 12px; padding: 10px 12px; border-radius: 10px; background: white; text-align: left; font-size: 13px; }
.birthday-list small { margin-left: 12px; color: #81705c; }
.today { color: #b74e15; font-weight: 600; }
.birthday-empty { padding: 12px 0; }
.birthday-note { margin-top: 12px; line-height: 1.6; }
</style>
