<script setup>
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { numeric } from '@/lib/finance'

const props = defineProps({ data: { type: Object, default: null } })
const chartRef = ref(null)
const chartError = ref('')
let chart = null, library = null, observer = null, disposed = false
const render = async () => {
  await nextTick()
  if (disposed || !chartRef.value || !props.data?.xAxis?.length) return
  try {
    if (!library) library = import('@/lib/dashboard-chart')
    const echarts = await library
    if (disposed || !chartRef.value || !props.data?.xAxis?.length) return
    if (!chart) chart = echarts.init(chartRef.value)
    chart.resize()
    chart.setOption({
      color: ['#2563eb', '#f59e0b', '#059669'],
      tooltip: { trigger: 'axis', valueFormatter: value => `¥ ${numeric(value).toFixed(2)}` },
      legend: { top: 0, right: 0, icon: 'roundRect', itemWidth: 14, itemHeight: 8 },
      grid: { left: 8, right: 16, top: 50, bottom: 12, containLabel: true },
      xAxis: { type: 'category', data: props.data.xAxis, boundaryGap: false, axisTick: { show: false }, axisLine: { lineStyle: { color: '#e2e8f0' } }, axisLabel: { color: '#64748b', hideOverlap: true } },
      yAxis: { type: 'value', name: '金额（元）', nameTextStyle: { color: '#64748b' }, axisLabel: { color: '#64748b' }, splitLine: { lineStyle: { color: '#f1f5f9' } } },
      series: (props.data.series || []).map(series => ({ name: series.name, type: 'line', showSymbol: false, smooth: false, lineStyle: { width: 2 }, data: series.data || [] }))
    }, true)
    chartError.value = ''
  } catch { if (!disposed) chartError.value = '图表加载失败，请重试。' }
}
watch(() => props.data, render, { flush: 'post' })
onMounted(() => {
  if (typeof ResizeObserver !== 'undefined') { observer = new ResizeObserver(() => chart?.resize()); observer.observe(chartRef.value) }
  render()
})
onBeforeUnmount(() => { disposed = true; observer?.disconnect(); chart?.dispose(); chart = null })
</script>

<template>
  <div>
    <el-alert v-if="chartError" :title="chartError" type="warning" :closable="false" show-icon><template #default><el-button link type="primary" @click="render">重试图表</el-button></template></el-alert>
    <div v-show="data?.xAxis?.length" ref="chartRef" class="finance-trend-chart"></div>
    <div v-if="!data?.xAxis?.length" class="finance-empty">所选时段暂无趋势数据</div>
  </div>
</template>

<style scoped>
.finance-trend-chart { width: 100%; height: 330px; }
</style>
