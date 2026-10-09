<script setup>
import { ref, onMounted, reactive, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Search, Right } from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'
import { inventorySummary, skuInventory } from '@/lib/inventory'
import request from '@/lib/request'
import { ElMessage, ElMessageBox } from 'element-plus'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
let productDetailSequence = 0
let inventorySequence = 0
const stockItems = ref([])
const loading = ref(false)
const submitting = ref(false)
const inventoryPage = ref(1)
const inventoryTotal = ref(0)
const productChoices = ref([])
const productChoiceLoading = ref(false)
const searchQuery = ref('')
const showDialog = ref(false)
const dialogType = ref('inbound')
const showHistoryDialog = ref(false)
const historyLoading = ref(false)
const historyList = ref([])
const historyTotal = ref(0)
const showHistoryTitle = ref('')
const selectedProduct = ref(null)
const stocktakeExpected = ref(null)
const skuOptions = ref([])
const historySkuOptions = ref([])
const historyQuery = reactive({
  productId: '',
  skuId: '',
  type: '',
  page: 1,
  pageSize: 10
})

const form = reactive({
  productId: '',
  skuId: '',
  quantity: 0,
  reason: ''
})

const fetchInventory = async () => {
  const sequence = ++inventorySequence
  loading.value = true
  try {
    const res = await request.get('/products', {
      params: {
        page: inventoryPage.value,
        pageSize: 20,
        keyword: searchQuery.value || undefined
      }
    })
    if (sequence !== inventorySequence) return
    inventoryTotal.value = Number(res.total || 0)
    stockItems.value = (res.list || []).map(p => ({
      id: p.id,
      name: p.name,
      image: p.image,
      current: inventorySummary(p).stock,
      min: inventorySummary(p).threshold,
      lowCount: inventorySummary(p).lowCount,
      status: inventorySummary(p).lowCount ? 'low' : 'normal',
      hasSkus: Boolean(p.hasSkus),
      skus: p.skus || [],
      specList: p.specList || []
    }))
  } catch (e) {
    console.error(e)
  } finally {
    if (sequence === inventorySequence) loading.value = false
  }
}

const normalizeSpecs = (raw) => {
  if (!raw) return {}
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (Array.isArray(obj)) return {}
    if (obj && typeof obj === 'object') return obj
    return {}
  } catch {
    return {}
  }
}

const formatSpecsLabel = (specsObj) => {
  const label = Object.values(specsObj || {}).join(' / ')
  return label || '默认SKU'
}

const normalizeSkuMeta = (s) => {
  const specsObj = normalizeSpecs(s?.specs ?? s?.sku_specs ?? s?.skuSpecs ?? s?.skuSpecs)
  const { stock, threshold: low } = skuInventory(s)
  const skuCode = s?.skuCode ?? s?.sku_code ?? s?.code ?? ''
  return { id: s?.id, specsObj, stock, low, skuCode }
}

const selectedSkuMeta = computed(() => {
  const id = form.skuId
  if (!id) return null
  const skus = selectedProduct.value?.skus || []
  const match = skus.find(s => String(s?.id) === String(id))
  return match ? normalizeSkuMeta(match) : null
})

watch(selectedSkuMeta, (sku) => {
  if (dialogType.value === 'stocktake') {
    stocktakeExpected.value = sku?.stock ?? null
    form.quantity = sku?.stock
  } else if (dialogType.value === 'threshold') {
    form.quantity = sku?.low
  }
}, { flush: 'sync' })

const canSubmit = computed(() => Boolean(form.productId)
  && Boolean(selectedSkuMeta.value)
  && Number.isInteger(form.quantity)
  && form.quantity >= (['stocktake', 'threshold'].includes(dialogType.value) ? 0 : 1)
  && (dialogType.value !== 'stocktake' || stocktakeExpected.value !== null)
  && (dialogType.value !== 'outbound' || form.quantity <= selectedSkuMeta.value.stock)
  && (!['outbound', 'stocktake'].includes(dialogType.value) || Boolean(form.reason.trim())))

const dialogTitle = computed(() => ({ inbound: '商品入库', outbound: '商品出库', stocktake: '库存盘点', threshold: '设置库存预警' }[dialogType.value]))
const quantityLabel = computed(() => ({ inbound: '入库数量', outbound: '出库数量', stocktake: '实际清点数量', threshold: '预警阈值' }[dialogType.value]))

const loadProductDetail = async (row) => {
  const sequence = ++productDetailSequence
  try {
    const res = await request.get(`/products/${row.id}`)
    if (sequence !== productDetailSequence || String(form.productId) !== String(row.id)) return
    const p = res.data || res
    form.productId = p.id ?? row.id
    selectedProduct.value = p
    
    const skus = p.skus || []
    const options = skus
      .map(s => normalizeSkuMeta(s))
      .filter(s => s.id !== undefined && s.id !== null)
      .map(s => ({
        value: s.id,
        label: `${formatSpecsLabel(s.specsObj)}${s.skuCode ? ` (${s.skuCode})` : ''}`,
        stock: s.stock,
        low: s.low
      }))
    skuOptions.value = options
    if (options.length === 1) form.skuId = options[0].value
  } catch (e) {
    if (sequence !== productDetailSequence) return
    console.error(e)
    selectedProduct.value = null
    skuOptions.value = []
  }
}

const fetchHistory = async () => {
  historyLoading.value = true
  try {
    const res = await request.get('/warehouse/history', {
      params: {
        productId: historyQuery.productId || undefined,
        skuId: historyQuery.skuId || undefined,
        type: historyQuery.type || undefined,
        page: historyQuery.page,
        pageSize: historyQuery.pageSize
      }
    })
    historyTotal.value = res.total || 0
    historyList.value = res.list || []
  } catch (e) {
    console.error(e)
  } finally {
    historyLoading.value = false
  }
}

const typeText = (t) => ({ inbound: '入库', outbound: '出库', stocktake: '盘点' }[t] || t)
const delta = (row) => {
  const prev = row.previousStock
  const curr = row.currentStock
  if (prev !== undefined && prev !== null && curr !== undefined && curr !== null) {
    return Number(curr) - Number(prev)
  }
  return Number(row.quantity || 0)
}
const formatDateTime = (val) => {
  if (!val) return ''
  const d = new Date(val)
  if (Number.isNaN(d.getTime())) return String(val)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
const specsLabel = (row) => {
  const raw = row.skuSpecs ?? row.sku_specs ?? row.specs
  if (!raw) return ''
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      return Object.values(obj).join(' / ')
    }
    return String(raw)
  } catch {
    return String(raw)
  }
}

const searchProducts = async (keyword = '') => {
  productChoiceLoading.value = true
  try {
    const res = await request.get('/products', { params: { keyword, page: 1, pageSize: 50 } })
    productChoices.value = res.list || []
  } finally { productChoiceLoading.value = false }
}

const handleAction = async (type, row = null, skuId = null) => {
  if (type === 'inbound') await searchProducts()
  dialogType.value = type
  form.productId = row ? row.id : ''
  selectedProduct.value = null
  stocktakeExpected.value = null
  skuOptions.value = []
  form.skuId = ''
  form.quantity = type === 'stocktake' ? undefined : 1
  form.reason = ''
  if (row) {
    await loadProductDetail(row)
    if (skuId && skuOptions.value.some(option => String(option.value) === String(skuId))) form.skuId = skuId
  }
  showDialog.value = true
}

const openHistory = (row) => {
  historyQuery.productId = row ? row.id : ''
  historyQuery.skuId = ''
  historyQuery.type = ''
  historyQuery.page = 1
  showHistoryDialog.value = true
  showHistoryTitle.value = `${row.name || '所有商品'} 的出入库记录`
  historySkuOptions.value = []
  if (row?.skus?.length) {
    historySkuOptions.value = row.skus
      .map(s => normalizeSkuMeta(s))
      .filter(s => s.id !== undefined && s.id !== null)
      .map(s => ({ value: s.id, label: `${formatSpecsLabel(s.specsObj)}${s.skuCode ? ` (${s.skuCode})` : ''}` }))
  }
  fetchHistory()
}

const handleHistoryTypeChange = (val) => {
  historyQuery.type = val || ''
  historyQuery.page = 1
  fetchHistory()
}

const handleHistorySkuChange = (val) => {
  historyQuery.skuId = val || ''
  historyQuery.page = 1
  fetchHistory()
}

const handleHistoryPageChange = (page) => {
  historyQuery.page = page
  fetchHistory()
}

const handleSelectProduct = async (id) => {
  ++productDetailSequence
  form.productId = id || ''
  form.skuId = ''
  selectedProduct.value = null
  skuOptions.value = []
  const item = productChoices.value.find(i => i.id === id) || stockItems.value.find(i => i.id === id)
  if (item) {
    await loadProductDetail(item)
  } else {
    selectedProduct.value = null
    skuOptions.value = []
  }
}
const submitAction = async () => {
  if (submitting.value) return
  if (!canSubmit.value) {
    ElMessage.error('请选择规格、填写有效数量，并填写出库或盘点原因'); return
  }
  submitting.value = true
  try {
    let endpoint = ''
    if (dialogType.value === 'inbound') {
      endpoint = '/warehouse/inbound'
    } else if (dialogType.value === 'outbound') {
      endpoint = '/warehouse/outbound'
    } else if (dialogType.value === 'stocktake') {
      endpoint = '/warehouse/stocktake'
    } else {
      endpoint = '/warehouse/threshold'
    }
    const payload = {
      productId: form.productId,
      skuId: form.skuId || undefined,
      quantity: form.quantity,
      reason: form.reason.trim()
    }
    if (dialogType.value === 'threshold') {
      payload.lowStockThreshold = form.quantity
      delete payload.quantity
      delete payload.reason
    }
    if (dialogType.value === 'stocktake') {
      payload.expectedStock = stocktakeExpected.value
      const change = form.quantity - payload.expectedStock
      const adjustment = change === 0 ? '库存不变' : `${change > 0 ? '增加' : '减少'} ${Math.abs(change)}`
      await ElMessageBox.confirm(`${selectedProduct.value?.name || '商品'} · ${formatSpecsLabel(selectedSkuMeta.value?.specsObj)}：${payload.expectedStock} → ${form.quantity}（${adjustment}）。请确认数量为实际清点后的库存。`, '确认库存盘点', { type: 'warning' })
    }
    if ((selectedProduct.value?.skus || []).length > 1 && !form.skuId) {
      ElMessage.error('多规格商品请选择规格')
      return
    }
    await request.post(endpoint, payload)
    ElMessage.success('操作成功')
    showDialog.value = false
    await fetchInventory()
  } catch (e) {
    if (e === 'cancel' || e === 'close') return
    if (e?.response?.status === 409) {
      await loadProductDetail({ id: form.productId })
      await fetchInventory()
    }
    console.error(e)
  } finally { submitting.value = false }
}

const openShortcut = async () => {
  const { productId, action } = route.query
  if (!/^\d+$/.test(String(productId || '')) || !['inbound', 'stocktake'].includes(action)) return
  await handleAction(action, { id: productId })
}

onMounted(async () => {
  await fetchInventory()
  await openShortcut()
})
watch(() => route.query, openShortcut)
</script>

<template>
  <el-card>
    <template #header>
      <div class="flex justify-between items-center">
        <span class="font-bold">库存查询</span>
        <div class="flex gap-2">
          <el-input 
            v-model="searchQuery"
            placeholder="商品名称" 
            :prefix-icon="Search" 
            class="w-48" 
            @keyup.enter="inventoryPage = 1; fetchInventory()"
            clearable
            @clear="inventoryPage = 1; fetchInventory()"
          />
          <el-button type="primary" @click="handleAction('inbound')">入库</el-button>
        </div>
      </div>
    </template>
    
    <el-table :data="stockItems" style="width: 100%" v-loading="loading">
      <el-table-column type="expand">
        <template #default="{ row }">
          <el-table :data="row.skus" size="small" class="px-6">
            <el-table-column label="规格" min-width="150"><template #default="{ row: sku }">{{ formatSpecsLabel(normalizeSkuMeta(sku).specsObj) }}</template></el-table-column>
            <el-table-column label="编码" width="120"><template #default="{ row: sku }">{{ normalizeSkuMeta(sku).skuCode || '—' }}</template></el-table-column>
            <el-table-column label="当前库存" width="90"><template #default="{ row: sku }">{{ normalizeSkuMeta(sku).stock }}</template></el-table-column>
            <el-table-column label="预警阈值" width="100"><template #default="{ row: sku }">{{ normalizeSkuMeta(sku).low }}</template></el-table-column>
            <el-table-column label="状态" width="100"><template #default="{ row: sku }"><el-tag :type="skuInventory(sku).low ? 'danger' : 'success'" size="small">{{ skuInventory(sku).low ? '库存不足' : '正常' }}</el-tag></template></el-table-column>
            <el-table-column label="操作" min-width="220"><template #default="{ row: sku }">
              <el-button link type="primary" @click="handleAction('inbound', row, sku.id)">入库</el-button>
              <el-button link type="danger" @click="handleAction('outbound', row, sku.id)">出库</el-button>
              <el-button link type="primary" @click="handleAction('stocktake', row, sku.id)">盘点</el-button>
              <el-button link type="primary" @click="handleAction('threshold', row, sku.id)">预警设置</el-button>
            </template></el-table-column>
          </el-table>
        </template>
      </el-table-column>
      <el-table-column prop="name" label="商品名称" min-width="160" />
      <el-table-column label="规格" width="90">
        <template #default="{ row }">
          <template v-if="(row.skus || []).length > 1">
            <el-tag size="small" effect="plain">{{ (row.skus || []).length }}个规格</el-tag>
          </template>
          <template v-else>默认规格</template>
        </template>
      </el-table-column>
      <el-table-column prop="current" label="当前库存" width="100">
        <template #default="{ row }">
          <span :class="row.status === 'low' ? 'text-red-600 font-bold' : ''">{{ row.current }}</span>
        </template>
      </el-table-column>
      <el-table-column label="预警阈值" width="130"><template #default="{ row }">{{ row.min === null ? '展开查看各规格' : row.min }}</template></el-table-column>
      <el-table-column prop="status" label="状态" width="155">
        <template #default="{ row }">
          <el-tag v-if="row.status === 'low'" type="danger">{{ row.lowCount }}个规格库存不足</el-tag>
          <el-tag v-else type="success">正常</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="230">
        <template #default="{ row }">
          <el-button link type="primary" @click="openHistory(row)">库存流水</el-button>
          <el-button link type="danger" @click="handleAction('outbound', row)">出库</el-button>
          <el-button link type="primary" @click="handleAction('stocktake', row)">盘点</el-button>
          <el-button link type="primary" @click="handleAction('threshold', row)">预警设置</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination v-model:current-page="inventoryPage" :page-size="20" :total="inventoryTotal" layout="total, prev, pager, next" @current-change="fetchInventory" class="mt-4" />

    <el-dialog v-model="showDialog" :title="dialogTitle" width="480px" :close-on-click-modal="!submitting" :close-on-press-escape="!submitting" :show-close="!submitting">
      <el-form label-width="80px">
        <el-alert v-if="dialogType === 'stocktake'" title="填写实物清点后的总数量。盘点期间库存发生变化时，请重新核对。" type="info" :closable="false" class="mb-4" />
        <el-alert v-if="dialogType === 'threshold'" title="阈值为0时关闭提前预警；库存为0时仍提示缺货。" type="info" :closable="false" class="mb-4" />
        <el-form-item v-if="form.productId && selectedProduct" label="商品">{{ selectedProduct.name }}</el-form-item>
        <el-form-item label="选择商品" v-if="!form.productId || dialogType === 'inbound'">
          <el-select 
            v-model="form.productId" 
            placeholder="请选择商品" 
            filterable
            remote
            :remote-method="searchProducts"
            :loading="productChoiceLoading"
            :disabled="submitting"
            clearable
            style="width: 100%"
            @change="handleSelectProduct"
          >
            <el-option
              v-for="item in productChoices"
              :key="item.id"
              :label="item.name"
              :value="item.id"
            >
              <span style="float: left">{{ item.name }}</span>
              <span style="float: right; color: #8492a6; font-size: 13px">ID: {{ item.id }}</span>
            </el-option>
          </el-select>
          <div class="mt-1 text-xs text-gray-500">
            商品不存在？
            <el-link v-if="userStore.hasPermission('product:view')" type="primary" :underline="false" class="text-xs" @click="router.push('/products')">
              去新建商品
            </el-link>
          </div>
        </el-form-item>
        <el-form-item label="选择规格" v-if="selectedProduct && skuOptions.length">
          <el-select v-model="form.skuId" placeholder="请选择规格" filterable clearable style="width: 100%" :disabled="submitting">
            <el-option v-for="opt in skuOptions" :key="String(opt.value)" :label="opt.label" :value="opt.value">
              <div class="flex justify-between items-center w-full">
                <span>{{ opt.label }}</span>
                <span v-if="opt.stock !== null && opt.stock !== undefined" class="text-xs text-slate-500">库存 {{ opt.stock }}</span>
              </div>
            </el-option>
          </el-select>
          <div v-if="selectedSkuMeta" class="mt-1 text-xs text-gray-500">
            该规格库存 {{ selectedSkuMeta.stock }}，预警 {{ selectedSkuMeta.low }}{{ selectedSkuMeta.skuCode ? `，编码 ${selectedSkuMeta.skuCode}` : '' }}
          </div>
          <div v-else-if="(selectedProduct.skus || []).length > 1" class="mt-1 text-xs text-gray-500">
            多规格商品必须选择规格
          </div>
        </el-form-item>
        <el-form-item :label="quantityLabel" label-width="110px">
          <!-- 数值组件仅在挂载时设置无障碍禁用状态，切换规格或提交状态时同步重新挂载。 -->
          <el-input-number :key="[dialogType, form.skuId, Boolean(selectedSkuMeta), submitting].join(':')" v-model="form.quantity" :min="['stocktake', 'threshold'].includes(dialogType) ? 0 : 1" :max="dialogType === 'outbound' ? selectedSkuMeta?.stock : 2147483647" :precision="0" :disabled="submitting || !selectedSkuMeta" />
        </el-form-item>
        <el-form-item v-if="dialogType !== 'threshold'" :label="dialogType === 'inbound' ? '备注' : '原因'" :required="dialogType !== 'inbound'">
          <el-input v-model="form.reason" type="textarea" :maxlength="500" :placeholder="dialogType === 'outbound' ? '请填写报损、领用等出库原因' : dialogType === 'stocktake' ? '请填写盘点差异或核对说明' : '可填写采购、补货等入库说明'" :disabled="submitting" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDialog = false" :disabled="submitting">取消</el-button>
        <el-button type="primary" @click="submitAction" :loading="submitting" :disabled="!canSubmit">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showHistoryDialog" :title="showHistoryTitle" width="1200px" class="rounded-lg">
      <div class="flex justify-between items-center p-4 mb-4 bg-gray-50 rounded-lg">
        <div class="flex gap-2 items-center">
          <span class="text-sm font-medium text-gray-600">筛选类型：</span>
          <el-radio-group v-model="historyQuery.type" @change="handleHistoryTypeChange" size="small">
            <el-radio-button label="">全部</el-radio-button>
            <el-radio-button label="inbound">入库</el-radio-button>
            <el-radio-button label="outbound">出库</el-radio-button>
            <el-radio-button label="stocktake">盘点</el-radio-button>
          </el-radio-group>
          <el-select
            v-if="historyQuery.productId && historySkuOptions.length"
            v-model="historyQuery.skuId"
            placeholder="全部规格"
            clearable
            filterable
            size="small"
            class="w-56"
            @change="handleHistorySkuChange"
          >
            <el-option v-for="opt in historySkuOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </div>
        <div class="text-xs text-gray-400">
          共 {{ historyTotal }} 条记录
        </div>
      </div>
      
      <el-table :data="historyList" border v-loading="historyLoading" stripe class="w-full">
        <el-table-column label="类型" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="row.type === 'inbound' ? 'success' : row.type === 'outbound' ? 'warning' : 'info'" effect="light" size="small">
              {{ typeText(row.type) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="SKU" width="80" align="center">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ row.skuCode }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="规格" min-width="140" align="center">
          <template #default="{ row }">
            <span class="text-gray-700">{{ specsLabel(row) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="变动数量" width="100" align="right">
          <template #default="{ row }">
            <span :class="delta(row) < 0 ? 'text-red-500 font-bold' : delta(row) > 0 ? 'text-green-600 font-bold' : 'text-gray-500 font-medium'">
              {{ delta(row) > 0 ? '+' : delta(row) < 0 ? '-' : '' }}{{ Math.abs(delta(row)) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="库存变化" width="180" align="center">
          <template #default="{ row }">
            <div class="flex gap-2 justify-center items-center text-xs">
              <span class="text-gray-500">{{ row.previousStock }}</span>
              <el-icon class="text-gray-400"><Right /></el-icon>
              <span class="font-bold text-gray-800">{{ row.currentStock }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="reason" label="备注" min-width="150"  align="center">
          <template #default="{ row }">
            <span class="font-medium text-gray-700">{{ row.reason }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="operator" label="操作人" width="100" align="center">
          <template #default="{ row }">
            <el-tag type="info" size="small" effect="plain">{{ row.operator }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作时间" width="170" align="center">
          <template #default="{ row }">
            <span class="text-xs text-gray-500">{{ formatDateTime(row.time || row.createdAt) }}</span>
          </template>
        </el-table-column>
      </el-table>
      
      <div class="flex justify-end pt-2 mt-4 border-t border-gray-100">
        <el-pagination
          background
          layout="total, prev, pager, next"
          :total="historyTotal"
          :page-size="historyQuery.pageSize"
          :current-page="historyQuery.page"
          @current-change="handleHistoryPageChange"
          size="small"
        />
      </div>
      <template #footer>
        <el-button @click="showHistoryDialog = false">关闭</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>
