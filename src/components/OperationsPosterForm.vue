<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Upload, Picture } from '@element-plus/icons-vue'
import request from '@/lib/request'

const props = defineProps({ poster: Object, coupon: Boolean })
const emit = defineEmits(['uploading'])
const poster = computed(() => props.poster)
const uploading = ref(false), uploadError = ref('')
let version = 0
function beforeUpload(file) {
  if (!['image/png', 'image/jpeg', 'image/gif'].includes(file.type) || file.size > 5 * 1024 * 1024) {
    ElMessage.warning('请选择不超过 5MB 的 PNG、JPG 或 GIF 图片')
    return false
  }
  return true
}
async function upload(options) {
  const current = ++version
  uploading.value = true; uploadError.value = ''; emit('uploading', true)
  try {
    const body = new FormData(); body.append('file', options.file)
    const result = await request.post('/common/upload', body, { timeout: 60000 })
    if (current !== version) return
    poster.value.imageUrl = result.url
    options.onSuccess(result)
  } catch (e) { if (current === version) { uploadError.value = e.message; options.onError(e) } }
  finally { if (current === version) { uploading.value = false; emit('uploading', false) } }
}
onBeforeUnmount(() => { version++; emit('uploading', false) })
</script>

<template>
  <div class="poster-settings">
    <el-form-item label="海报弹窗"><el-switch v-model="poster.enabled" active-text="每次进入本店时弹出" /><p class="poster-hint">关闭后本次浏览不重复弹；重新进入点单端时再次展示。</p></el-form-item>
    <template v-if="poster.enabled || poster.imageUrl">
      <el-form-item label="海报图片" :required="poster.enabled">
        <div class="poster-upload-area"><div v-if="poster.imageUrl" class="poster-thumbnail"><img :src="poster.imageUrl" alt="活动海报预览" /></div><div v-else class="poster-placeholder"><el-icon><Picture /></el-icon><span>上传你的活动海报</span></div>
          <el-upload :show-file-list="false" :http-request="upload" :before-upload="beforeUpload" accept="image/png,image/jpeg,image/gif" :disabled="uploading"><el-button :icon="Upload" :loading="uploading">{{ poster.imageUrl ? '更换海报' : '上传海报' }}</el-button></el-upload>
          <p class="poster-hint">建议竖版 750 × 1000 像素，支持 PNG、JPG、GIF，最大 5MB。海报完整展示，不裁剪。</p>
          <el-alert v-if="uploadError" :title="uploadError" type="error" :closable="false" show-icon />
        </div>
      </el-form-item>
      <el-form-item label="按钮文案"><el-input v-model="poster.buttonText" maxlength="30" show-word-limit :placeholder="coupon ? '领取优惠券' : '查看活动'" /><p class="poster-hint">点击后进入{{ coupon ? '本店优惠券页面' : '本店活动页面' }}，不会直接下单或扣款。</p></el-form-item>
      <el-form-item label="展示优先级"><el-input-number v-model="poster.priority" :min="0" :max="9999" :precision="0" /><p class="poster-hint">多个海报同时有效时只弹出优先级最高的一张；数值越大越优先，相同则展示最近编辑的海报。</p></el-form-item>
    </template>
    <p class="poster-notice">弹窗跟随本店活动的时间和启用状态。活动结束、停用或名额用完后自动停止展示；仅供收银台使用的活动不会在顾客端弹出。</p>
  </div>
</template>

<style scoped>
.poster-hint{width:100%;font-size:12px;color:#64748b;line-height:1.8;margin-top:8px}.poster-upload-area{width:100%}.poster-thumbnail,.poster-placeholder{width:170px;height:215px;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:10px;margin-bottom:12px;display:flex;align-items:center;justify-content:center;overflow:hidden}.poster-thumbnail img{width:100%;height:100%;object-fit:contain}.poster-placeholder{flex-direction:column;gap:12px;color:#94a3b8;font-size:12px}.poster-placeholder .el-icon{font-size:30px}.poster-notice{font-size:12px;line-height:1.8;color:#64748b;padding:12px 14px;background:#f8fafc;border-radius:8px;margin-bottom:18px}
</style>
