<script setup>
import { onBeforeUnmount, onMounted } from 'vue'
import { useUserStore } from '@/stores/user'
import { productNames } from '@/lib/products'
const user = useUserStore()
let timer
onMounted(() => { timer = setInterval(() => user.refreshProducts(true), 60000) })
onBeforeUnmount(() => clearInterval(timer))
</script>
<template>
  <el-alert v-if="user.productsError" :title="user.productsError" type="warning" :closable="false" class="mb-4"><el-button link @click="user.refreshProducts(true)">重新查询</el-button></el-alert>
  <template v-else><el-alert v-for="product in user.products.filter(item => item.historyAccessible && ['EXPIRED', 'EXPIRING', 'PAUSED', 'NOT_OPEN'].includes(item.status))" :key="product.productType" :type="product.status === 'EXPIRED' ? 'error' : 'warning'" :closable="false" class="mb-4" :title="product.status === 'EXPIRING' ? `${productNames[product.productType]}将于 ${product.expiresOn} 到期（剩余 ${product.daysRemaining} 天），请联系平台续费。` : `${productNames[product.productType]}新增交易已暂停，已有订单仍可履约、退款和售后。`" /></template>
</template>
