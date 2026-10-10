<script setup>
import { ref, watch } from 'vue'
import request from '@/lib/request'
const props = defineProps({ memberId: [Number, String], couponId: [Number, String], walletCode: String, disabled: Boolean })
const emit = defineEmits(['update:memberId', 'update:couponId', 'update:walletCode'])
const members = ref([]), coupons = ref([]), busy = ref(false), error = ref('')
let generation = 0
async function search(keyword) { const version = ++generation; busy.value = true; try { const result = await request.get('/operations/members', { params: { keyword, size: 30 }, silent: true }); if (version === generation) { members.value = result.list; error.value = '' } } catch (e) { if (version === generation) error.value = e.response?.data?.message || e.message } finally { if (version === generation) busy.value = false } }
watch(() => props.memberId, async id => { coupons.value = []; emit('update:couponId', null); emit('update:walletCode', ''); if (id) { try { const result = await request.get(`/operations/members/${id}/coupons`, { silent: true }); if (String(props.memberId) === String(id)) coupons.value = result.filter(c => c.status === 'AVAILABLE') } catch (e) { error.value = e.response?.data?.message || e.message } } })
</script>
<template>
  <div class="member-picker">
    <el-select :model-value="memberId" filterable remote clearable :remote-method="search" :loading="busy" :disabled="disabled" placeholder="搜索会员手机号（可选）" class="w-full" @update:model-value="emit('update:memberId', $event || null)"><el-option v-for="m in members" :key="m.id" :value="m.id" :label="`${m.name} ${m.phone || ''} · 余额 ¥${(Number(m.principal) + Number(m.bonus)).toFixed(2)}`" :disabled="m.status !== 'ACTIVE'" /></el-select>
    <el-select v-if="memberId" :model-value="couponId" clearable :disabled="disabled" placeholder="不使用优惠券，自动参加活动" class="w-full mt-2" @update:model-value="emit('update:couponId', $event || null)"><el-option v-for="c in coupons" :key="c.id" :value="c.id" :label="`${c.snapshot.name} · 满 ${c.snapshot.threshold}${c.snapshot.type === 'CASH' ? ` 减 ${c.snapshot.amount}` : ' 兑换菜品'}`" /></el-select>
    <el-input v-if="memberId" :model-value="walletCode" :disabled="disabled" placeholder="钱包付款时输入 / 扫描会员出示的付款码" clearable class="mt-2" @update:model-value="emit('update:walletCode', $event)" />
    <p v-if="error" class="text-red-600 text-xs mt-2">{{ error }}</p>
  </div>
</template>
<style scoped>.member-picker{padding:12px 16px;background:#eff6ff;border-bottom:1px solid #dbeafe}</style>
