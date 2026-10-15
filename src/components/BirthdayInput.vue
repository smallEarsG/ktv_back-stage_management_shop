<script setup>
import { computed, ref, watch } from 'vue'
import { birthdayDays, birthdayValue } from '@/lib/birthdays'
const props = defineProps({ modelValue: { type: String, default: null } })
const emit = defineEmits(['update:modelValue', 'invalid-change'])
const month = ref(''), day = ref('')
watch(() => props.modelValue, value => { const parts = (value || '').split('-'); month.value = parts[0] ? Number(parts[0]) : ''; day.value = parts[1] ? Number(parts[1]) : '' }, { immediate: true })
const days = computed(() => birthdayDays(month.value))
watch([month, day], () => { emit('invalid-change', Boolean(month.value || day.value) && !birthdayValue(month.value, day.value)) }, { immediate: true })
function updateMonth(value) { month.value = value; if (Number(day.value) > days.value) day.value = ''; publish() }
function updateDay(value) { day.value = value; publish() }
function publish() { const value = birthdayValue(month.value, day.value); if (value || (!month.value && !day.value)) emit('update:modelValue', value) }
function clear() { month.value = ''; day.value = ''; publish() }
</script>
<template>
  <div>
    <div class="flex flex-wrap items-center gap-2">
      <el-select :model-value="month" aria-label="生日月份" placeholder="月" class="birthday-part" @update:model-value="updateMonth"><el-option v-for="value in 12" :key="value" :label="`${value}月`" :value="value" /></el-select>
      <el-select :model-value="day" aria-label="生日日期" placeholder="日" :disabled="!month" class="birthday-part" @update:model-value="updateDay"><el-option v-for="value in days" :key="value" :label="`${value}日`" :value="value" /></el-select>
      <el-button v-if="month || day" link @click="clear">清空生日</el-button>
    </div>
    <p class="mt-1 text-xs text-slate-500">选填公历月日，无需出生年份；2月29日在非闰年按2月28日提醒。</p>
  </div>
</template>
<style scoped>.birthday-part { width: 100px; }</style>
