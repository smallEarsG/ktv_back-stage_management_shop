<script setup>
import { computed } from 'vue'
import { receiptHtml } from '@/lib/dining'

const props = defineProps({ payload: { type: Object, default: null }, paperWidth: { type: Number, default: 80 } })
const emit = defineEmits(['close'])
const html = computed(() => receiptHtml(props.payload || {}, { paperWidth: props.paperWidth }))
</script>

<template>
  <el-dialog :model-value="Boolean(payload)" :title="payload?.kind === 'SETTLEMENT' ? '结账小票预览' : '出餐小票预览'" width="min(480px, calc(100vw - 32px))" destroy-on-close @update:model-value="value => { if (!value) emit('close') }">
    <p class="receipt-hint">{{ paperWidth }}mm 小票 · 请核对内容。预览和打印不会自动确认队列状态。</p>
    <iframe class="receipt-preview" title="小票内容" sandbox="allow-scripts allow-modals" :srcdoc="html" />
    <p class="receipt-hint">连接打印机后，可点击小票内的“打印小票”；纸张实际输出后再确认已打印。</p>
    <template #footer><el-button @click="emit('close')">关闭预览</el-button></template>
  </el-dialog>
</template>

<style scoped>
.receipt-hint{font-size:12px;color:#64748b;line-height:1.6;margin:0 0 12px;overflow-wrap:anywhere}
.receipt-preview{display:block;width:100%;height:min(56vh,560px);min-height:220px;border:1px solid #e2e8f0;border-radius:8px;background:white;margin-bottom:12px}
</style>
