<script setup>
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { productNames, productStatuses, productAccessible, productTradable, firstProductPath } from '@/lib/products'
const user = useUserStore(), router = useRouter(), route = useRoute(), loading = ref(false)
async function load() { loading.value = true; try { await user.refreshProducts(true) } finally { loading.value = false } }
function enter(product) { router.push(firstProductPath([product], user.hasPermission)) }
onMounted(() => { if (!user.productsReady) load() })
</script>
<template>
  <section class="services-page">
    <header><div><h1>已购服务</h1><p>点餐和商城分别开通、配置与续费。需要调整请联系平台。</p></div><el-button :loading="loading" @click="load">刷新授权</el-button></header>
    <el-alert v-if="user.productsError" :title="user.productsError" type="error" :closable="false" show-icon />
    <el-alert v-else-if="route.query.unavailable" title="当前产品尚未开通或无法进入，请核对授权后重试。" type="warning" :closable="false" />
    <div v-if="user.productsReady" class="product-grid"><article v-for="product in user.products" :key="product.productType"><div class="product-heading"><h2>{{ product.name || productNames[product.productType] }}</h2><el-tag :type="productTradable(product) ? 'success' : 'info'">{{ !product.granted && productAccessible(product) ? '授权已撤销' : productStatuses[product.status] || product.status }}</el-tag></div><p>{{ product.expiresOn ? `到期日期：${product.expiresOn}（含当天）` : product.granted ? '服务未设置到期日' : productAccessible(product) ? '保留历史订单与售后处理' : '尚未开通此产品' }}</p><p class="muted">{{ productTradable(product) ? '可正常营业' : productAccessible(product) ? '新增交易暂停，已有订单仍可履约和售后' : '开通后显示对应业务菜单' }}</p><p v-if="product.application" class="muted">独立应用 #{{ product.application.id }}</p><el-button v-if="productAccessible(product)" type="primary" :disabled="firstProductPath([product], user.hasPermission) === '/services'" @click="enter(product)">进入{{ productNames[product.productType] }}</el-button></article></div>
    <el-empty v-else-if="!loading && !user.productsError" description="暂无可用服务，请联系平台" />
    <div class="account-entry"><span>账号管理不受产品期限影响</span><el-button @click="router.push('/account/security')">修改密码</el-button></div>
  </section>
</template>
<style scoped>
.services-page{max-width:1100px;margin:auto;display:grid;gap:20px}.services-page header,.product-heading,.account-entry{display:flex;justify-content:space-between;align-items:center;gap:16px}.services-page h1{font-size:24px;font-weight:650;color:#0f172a}.services-page header p,.services-page article p{font-size:14px;color:#64748b;margin:8px 0;line-height:1.7}.product-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.product-grid article{padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:white}.product-heading h2{font-size:18px;font-weight:650}.services-page article .muted{font-size:13px}.account-entry{font-size:13px;color:#64748b;padding:18px;border-top:1px solid #e2e8f0}@media(max-width:750px){.product-grid{grid-template-columns:1fr}.services-page header{align-items:flex-start;flex-direction:column}.product-grid article{padding:18px}.account-entry{padding:12px 0}}
</style>
