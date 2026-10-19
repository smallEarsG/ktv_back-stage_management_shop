<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute(), router = useRouter(), retrying = ref(false)
const retryTarget = computed(() => {
  const target = route.query.next
  return typeof target === 'string' && target.startsWith('/') && !target.startsWith('//') && !target.includes('\\') && !/^\/connection(?:[/?#]|$)/.test(target) ? target : '/services'
})
async function retry() {
  if (retrying.value) return
  retrying.value = true
  try { await router.replace(retryTarget.value) }
  finally { retrying.value = false }
}
</script>

<template>
  <main class="connection-retry">
    <section>
      <span class="connection-icon" aria-hidden="true">↻</span>
      <h1>暂时无法连接</h1>
      <p>登录信息已保留。网络恢复后，可重新打开刚才的页面。</p>
      <el-button type="primary" :loading="retrying" @click="retry">重新连接</el-button>
      <RouterLink to="/login">返回登录页</RouterLink>
    </section>
  </main>
</template>

<style scoped>
.connection-retry{min-height:100dvh;display:grid;place-items:center;padding:24px;background:#f5f7fb;color:#334155}.connection-retry section{width:min(440px,100%);padding:32px;border:1px solid #e2e8f0;border-radius:16px;background:white;text-align:center}.connection-icon{display:block;font-size:40px;color:#4263eb}.connection-retry h1{font-size:24px;color:#0f172a;margin:12px 0}.connection-retry p{font-size:14px;line-height:1.8;color:#64748b;margin-bottom:24px}.connection-retry a{display:block;margin-top:18px;font-size:14px;color:#4263eb}
</style>
