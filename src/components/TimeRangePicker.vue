<script setup>
import { ref, onMounted } from 'vue'
import dayjs from 'dayjs'

const props = defineProps({
  modelValue: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['update:modelValue', 'change', 'update:label'])

// Shortcuts configuration
const shortcuts = [
  {
    text: '今日',
    value: 'today',
    onClick: () => {
      const start = dayjs().startOf('day').toDate()
      const end = dayjs().endOf('day').toDate()
      return [start, end]
    }
  },
  {
    text: '本周',
    value: 'week',
    onClick: () => {
      const start = dayjs().startOf('week').toDate()
      const end = dayjs().endOf('week').toDate()
      return [start, end]
    }
  },
  {
    text: '本月',
    value: 'month',
    onClick: () => {
      const start = dayjs().startOf('month').toDate()
      const end = dayjs().endOf('month').toDate()
      return [start, end]
    }
  },
  {
    text: '本年',
    value: 'year',
    onClick: () => {
      const start = dayjs().startOf('year').toDate()
      const end = dayjs().endOf('year').toDate()
      return [start, end]
    }
  }
]

// Initialize logic
const hasInitialValue = props.modelValue && props.modelValue.length > 0
const initialShortcut = hasInitialValue ? 'custom' : 'today'
const initialRange = hasInitialValue ? props.modelValue : shortcuts.find(s => s.value === 'today').onClick()

// Internal date range value
const dateRange = ref(initialRange)
const activeShortcut = ref(initialShortcut)

// Handle shortcut click
const handleShortcutClick = (shortcut) => {
  activeShortcut.value = shortcut.value
  const range = shortcut.onClick()
  dateRange.value = range
  emit('update:modelValue', range)
  emit('change', range)
  emit('update:label', shortcut.text)
}

// Handle date picker change
const handleDateChange = (val) => {
  activeShortcut.value = 'custom'
  emit('update:modelValue', val)
  emit('change', val)
  emit('update:label', '自定义')
}

// Emit initial value if default is used
onMounted(() => {
  if (!hasInitialValue) {
    emit('update:modelValue', dateRange.value)
    emit('change', dateRange.value)
    emit('update:label', shortcuts.find(s => s.value === 'today').text)
  } else {
    // If initial value provided, it's custom unless we match it (ignoring matching for now)
    emit('update:label', '自定义')
  }
})

</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <el-radio-group v-model="activeShortcut" size="default" @change="(val) => {
      const shortcut = shortcuts.find(s => s.value === val)
      if (shortcut) handleShortcutClick(shortcut)
    }">
      <el-radio-button 
        v-for="item in shortcuts" 
        :key="item.value" 
        :label="item.value"
      >
        {{ item.text }}
      </el-radio-button>
      <el-radio-button label="custom">自定义</el-radio-button>
    </el-radio-group>

    <el-date-picker
      v-if="activeShortcut === 'custom'"
      v-model="dateRange"
      type="daterange"
      range-separator="至"
      start-placeholder="开始日期"
      end-placeholder="结束日期"
      size="default"
      :shortcuts="[]" 
      @change="handleDateChange"
    />
  </div>
</template>

<style scoped>
/* Optional styling adjustments */
</style>
