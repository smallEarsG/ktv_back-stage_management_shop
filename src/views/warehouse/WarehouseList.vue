<script setup>
import { ref, onMounted, reactive, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Search, Right, ArrowDown, Refresh, Plus } from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'
import { inventorySummary, skuInventory } from '@/lib/inventory'
import request from '@/lib/request'
import { ElMessage, ElMessageBox } from 'element-plus'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
let productDetailSequence = 0
let inventorySequence = 0
let historySequence = 0
const stockItems = ref([])
const inventoryError = ref('')
const loading = ref(false)
const submitting = ref(false)
const inventoryPage = ref(1)
const inventoryTotal = ref(0)
const productChoices = ref([])
const productChoiceLoading = ref(false)
const searchQuery = ref('')
const stockStatus = ref('')
const appliedKeyword = ref('')
const selectingProduct = ref(false)
const detailLoading = ref(false)
const detailError = ref('')
const showDialog = ref(false)
const dialogType = ref('inbound')
const showHistoryDialog = ref(false)
const historyLoading = ref(false)
const historyError = ref('')
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
  inventoryError.value = ''
  try {
    const res = await request.get('/warehouse/inventory', {
      params: {
        page: inventoryPage.value,
        pageSize: 20,
        keyword: appliedKeyword.value || undefined,
        stockStatus: stockStatus.value || undefined
      }
    })
    if (sequence !== inventorySequence) return
    inventoryTotal.value = Number(res.total || 0)
    const lastPage = Math.max(1, Math.ceil(inventoryTotal.value / 20))
    if (inventoryPage.value > lastPage) {
      inventoryPage.value = lastPage
      return fetchInventory()
    }
    stockItems.value = (res.list || []).map(p => {
      const summary = inventorySummary(p)
      return {
        id: p.id,
        name: p.name,
        current: summary.stock,
        min: summary.threshold,
        lowCount: summary.lowCount,
        outCount: summary.outCount,
        skus: p.skus || []
      }
    })
  } catch (e) {
    if (sequence !== inventorySequence) return
    stockItems.value = []
    inventoryTotal.value = 0
    inventoryError.value = '库存加载失败，请重试。'
    console.error(e)
  } finally {
    if (sequence === inventorySequence) loading.value = false
  }
}

const searchInventory = () => {
  appliedKeyword.value = searchQuery.value.trim()
  inventoryPage.value = 1
  return fetchInventory()
}
const resetInventoryFilters = () => {
  searchQuery.value = ''
  stockStatus.value = ''
  return searchInventory()
}
const inventoryEmptyText = computed(() => loading.value ? '正在加载库存…' : inventoryError.value ? '暂时无法显示库存' : appliedKeyword.value || stockStatus.value ? '没有符合筛选条件的商品' : '暂无商品，请先在商品管理中新建商品')
const skuRowClass = ({ row }) => skuInventory(row).stock === 0 ? 'sku-out-row' : skuInventory(row).low ? 'sku-low-row' : ''

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
  return label || '默认规格'
}

const normalizeSkuMeta = (s) => {
  const specsObj = normalizeSpecs(s?.specs ?? s?.sku_specs ?? s?.skuSpecs)
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
  && form.quantity <= quantityLimit.value
  && (!['outbound', 'stocktake'].includes(dialogType.value) || Boolean(form.reason.trim())))

const dialogTitle = computed(() => ({ inbound: '商品入库', outbound: '商品出库', stocktake: '库存盘点', threshold: '设置库存预警' }[dialogType.value]))
const quantityLabel = computed(() => ({ inbound: '入库数量', outbound: '出库数量', stocktake: '实际清点数量', threshold: '预警阈值' }[dialogType.value]))
const submitLabel = computed(() => ({ inbound: '确认入库', outbound: '确认出库', stocktake: '确认盘点', threshold: '保存预警' }[dialogType.value]))
const quantityLimit = computed(() => dialogType.value === 'outbound' ? selectedSkuMeta.value?.stock ?? 0 : dialogType.value === 'inbound' ? 2147483647 - (selectedSkuMeta.value?.stock ?? 0) : 2147483647)
const stockPreview = computed(() => {
  if (!selectedSkuMeta.value || dialogType.value === 'threshold') return null
  const before = selectedSkuMeta.value.stock
  const valid = Number.isInteger(form.quantity) && form.quantity >= (dialogType.value === 'stocktake' ? 0 : 1) && form.quantity <= quantityLimit.value
  const after = valid ? dialogType.value === 'inbound' ? before + form.quantity : dialogType.value === 'outbound' ? before - form.quantity : form.quantity : null
  return { before, after, change: after === null ? null : after - before }
})

const loadProductDetail = async (row) => {
  const sequence = ++productDetailSequence
  detailLoading.value = true
  detailError.value = ''
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
    detailError.value = '商品规格加载失败，请重试。'
    selectedProduct.value = null
    skuOptions.value = []
  } finally {
    if (sequence === productDetailSequence) detailLoading.value = false
  }
}

const fetchHistory = async () => {
  const sequence = ++historySequence
  historyLoading.value = true
  historyError.value = ''
  historyList.value = []
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
    if (sequence !== historySequence) return
    historyTotal.value = res.total || 0
    historyList.value = res.list || []
  } catch (e) {
    if (sequence !== historySequence) return
    historyTotal.value = 0
    historyError.value = '库存流水加载失败，请重试。'
    console.error(e)
  } finally {
    if (sequence === historySequence) historyLoading.value = false
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
    return Array.isArray(obj) ? '' : String(raw)
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
  ++productDetailSequence
  detailLoading.value = false
  detailError.value = ''
  selectingProduct.value = !row
  dialogType.value = type
  form.productId = row ? row.id : ''
  selectedProduct.value = null
  stocktakeExpected.value = null
  skuOptions.value = []
  form.skuId = ''
  form.quantity = type === 'stocktake' ? undefined : 1
  form.reason = ''
  showDialog.value = true
  if (row) {
    const detailPromise = loadProductDetail(row)
    const sequence = productDetailSequence
    await detailPromise
    if (sequence !== productDetailSequence) return
    if (skuId && skuOptions.value.some(option => String(option.value) === String(skuId))) form.skuId = skuId
  }
  if (!row) await searchProducts()
}

const openHistory = (row, skuId = '') => {
  historyQuery.productId = row ? row.id : ''
  historyQuery.skuId = skuId
  historyQuery.type = ''
  historyQuery.page = 1
  showHistoryDialog.value = true
  showHistoryTitle.value = `${row?.name || '所有商品'} · 库存流水`
  historySkuOptions.value = []
  if (row?.skus?.length) {
    historySkuOptions.value = row.skus
      .map(s => normalizeSkuMeta(s))
      .filter(s => s.id !== undefined && s.id !== null)
      .map(s => ({ value: s.id, label: `${formatSpecsLabel(s.specsObj)}${s.skuCode ? ` (${s.skuCode})` : ''}` }))
  }
  fetchHistory()
}

const handleMoreAction = (command, row, skuId = null) => command === 'history' ? openHistory(row, skuId || '') : handleAction(command, row, skuId)

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
  detailLoading.value = false
  detailError.value = ''
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
    ElMessage.success({ inbound: '入库成功', outbound: '出库成功', stocktake: '盘点已保存', threshold: '预警设置已保存' }[dialogType.value])
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
  <div class="warehouse-page">
    <div class="warehouse-heading">
      <div>
        <h2>仓库管理</h2>
        <p>按规格查看库存，及时补货并记录库存变动。</p>
      </div>
      <div class="heading-actions">
        <el-button :icon="Refresh" :loading="loading" @click="fetchInventory">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="handleAction('inbound')">商品入库</el-button>
      </div>
    </div>

    <el-card class="inventory-card" shadow="never">
      <div class="inventory-toolbar">
        <el-radio-group v-model="stockStatus" aria-label="库存状态" @change="searchInventory">
          <el-radio-button label="">全部</el-radio-button>
          <el-radio-button label="low">库存不足</el-radio-button>
          <el-radio-button label="out">已缺货</el-radio-button>
        </el-radio-group>
        <div class="inventory-search">
          <el-input v-model="searchQuery" placeholder="搜索商品名称" aria-label="商品名称" :prefix-icon="Search" clearable @keyup.enter="searchInventory" @clear="searchInventory" />
          <el-button type="primary" plain :icon="Search" @click="searchInventory">搜索</el-button>
        </div>
      </div>
      <p class="inventory-note">库存不足包含已缺货商品；任一规格缺货都会提示，合计库存为所有规格的数量之和。</p>
      <el-alert v-if="inventoryError" :title="inventoryError" type="warning" :closable="false" show-icon class="resource-alert">
        <template #default><el-button link type="primary" :loading="loading" @click="fetchInventory">重新加载</el-button></template>
      </el-alert>

      <el-table :data="stockItems" row-key="id" v-loading="loading" :empty-text="inventoryEmptyText" class="inventory-table">
        <el-table-column type="expand" width="44">
          <template #default="{ row }">
            <div class="sku-panel">
              <div class="sku-panel-heading"><strong>{{ row.name }} · 各规格库存</strong><span>请按实际规格操作</span></div>
              <el-table :data="row.skus" row-key="id" size="small" :row-class-name="skuRowClass" empty-text="暂无规格，请在商品管理中完善规格">
                <el-table-column label="规格" min-width="150">
                  <template #default="{ row: sku }">{{ formatSpecsLabel(normalizeSkuMeta(sku).specsObj) }}</template>
                </el-table-column>
                <el-table-column label="规格编码" width="125" show-overflow-tooltip>
                  <template #default="{ row: sku }">{{ normalizeSkuMeta(sku).skuCode || '—' }}</template>
                </el-table-column>
                <el-table-column label="当前库存" width="100" align="right">
                  <template #default="{ row: sku }"><strong :class="{ 'stock-out': skuInventory(sku).stock === 0, 'stock-low': skuInventory(sku).stock > 0 && skuInventory(sku).low }">{{ normalizeSkuMeta(sku).stock }}</strong></template>
                </el-table-column>
                <el-table-column label="预警阈值" width="115" align="right">
                  <template #default="{ row: sku }"><span :class="{ 'muted': normalizeSkuMeta(sku).low === 0 }">{{ normalizeSkuMeta(sku).low === 0 ? '关闭提前预警' : normalizeSkuMeta(sku).low }}</span></template>
                </el-table-column>
                <el-table-column label="状态" width="105">
                  <template #default="{ row: sku }"><el-tag :type="skuInventory(sku).stock === 0 ? 'danger' : skuInventory(sku).low ? 'warning' : 'success'" size="small" effect="light">{{ skuInventory(sku).stock === 0 ? '已缺货' : skuInventory(sku).low ? '库存不足' : '正常' }}</el-tag></template>
                </el-table-column>
                <el-table-column label="操作" width="190" fixed="right">
                  <template #default="{ row: sku }">
                    <div class="row-actions">
                      <el-button link type="primary" @click="handleAction('inbound', row, sku.id)">入库</el-button>
                      <el-button link type="primary" :disabled="skuInventory(sku).stock === 0" @click="handleAction('outbound', row, sku.id)">出库</el-button>
                      <el-dropdown trigger="click" @command="command => handleMoreAction(command, row, sku.id)">
                        <el-button link type="primary" aria-label="规格更多操作">更多<el-icon><ArrowDown /></el-icon></el-button>
                        <template #dropdown>
                          <el-dropdown-menu>
                            <el-dropdown-item command="stocktake">库存盘点</el-dropdown-item>
                            <el-dropdown-item command="threshold">预警设置</el-dropdown-item>
                            <el-dropdown-item command="history" divided>库存流水</el-dropdown-item>
                          </el-dropdown-menu>
                        </template>
                      </el-dropdown>
                    </div>
                  </template>
                </el-table-column>
              </el-table>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="商品名称" min-width="180" show-overflow-tooltip>
          <template #default="{ row }"><span class="product-name">{{ row.name }}</span></template>
        </el-table-column>
        <el-table-column prop="current" label="合计库存" width="105" align="right">
          <template #default="{ row }"><strong class="stock-number" :class="{ 'stock-out': row.current === 0 }">{{ row.current }}</strong></template>
        </el-table-column>
        <el-table-column label="规格" min-width="130" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="row.skus.length > 1" class="spec-count">{{ row.skus.length }} 个规格<span class="muted"> · 展开查看</span></span>
            <span v-else>{{ formatSpecsLabel(normalizeSkuMeta(row.skus[0]).specsObj) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="预警阈值" width="130" align="right">
          <template #default="{ row }"><span :class="{ 'muted': row.min === null || row.min === 0 }">{{ row.min === null ? '按规格设置' : row.min === 0 ? '关闭提前预警' : row.min }}</span></template>
        </el-table-column>
        <el-table-column label="库存状态" width="175">
          <template #default="{ row }">
            <div class="status-tags">
              <el-tag v-if="row.outCount" type="danger" size="small">{{ row.outCount }} 个规格缺货</el-tag>
              <el-tag v-if="row.lowCount > row.outCount" type="warning" size="small">{{ row.lowCount - row.outCount }} 个规格库存不足</el-tag>
              <el-tag v-if="!row.lowCount" type="success" size="small">正常</el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="190" fixed="right">
          <template #default="{ row }">
            <div class="row-actions">
              <el-button link type="primary" @click="handleAction('inbound', row)">入库</el-button>
              <el-button link type="primary" :disabled="row.current === 0" @click="handleAction('outbound', row)">出库</el-button>
              <el-dropdown trigger="click" @command="command => handleMoreAction(command, row)">
                <el-button link type="primary" aria-label="商品更多操作">更多<el-icon><ArrowDown /></el-icon></el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="stocktake">库存盘点</el-dropdown-item>
                    <el-dropdown-item command="threshold">预警设置</el-dropdown-item>
                    <el-dropdown-item command="history" divided>库存流水</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </template>
        </el-table-column>
      </el-table>
      <div v-if="!loading && !inventoryError && !stockItems.length" class="inventory-empty-action">
        <el-button v-if="appliedKeyword || stockStatus" @click="resetInventoryFilters">清空筛选</el-button>
        <el-button v-else-if="userStore.hasPermission('product:view')" type="primary" plain @click="router.push('/products')">去新建商品</el-button>
      </div>
      <div class="inventory-pagination">
        <el-pagination v-model:current-page="inventoryPage" :page-size="20" :total="inventoryTotal" layout="total, prev, pager, next" background @current-change="fetchInventory" />
      </div>
    </el-card>

    <el-dialog v-model="showDialog" :title="dialogTitle" width="min(520px, calc(100vw - 32px))" :close-on-click-modal="!submitting" :close-on-press-escape="!submitting" :show-close="!submitting" class="inventory-action-dialog">
      <el-alert v-if="detailError" :title="detailError" type="warning" :closable="false" show-icon class="resource-alert">
        <template #default><el-button link type="primary" @click="loadProductDetail({ id: form.productId })">重新加载规格</el-button></template>
      </el-alert>
      <el-form label-width="110px" v-loading="detailLoading">
        <el-alert v-if="dialogType === 'stocktake'" title="填写实物清点后的总数量。盘点期间库存发生变化时，请重新核对。" type="info" :closable="false" class="resource-alert" />
        <el-alert v-if="dialogType === 'threshold'" title="阈值为 0 时关闭提前预警；库存为 0 时仍提示缺货。" type="info" :closable="false" class="resource-alert" />
        <el-form-item v-if="!selectingProduct && selectedProduct" label="商品">
          <strong>{{ selectedProduct.name }}</strong>
        </el-form-item>
        <el-form-item v-if="selectingProduct" label="选择商品" required>
          <el-select v-model="form.productId" placeholder="输入商品名称搜索" filterable remote :remote-method="searchProducts" :loading="productChoiceLoading" :disabled="submitting" clearable style="width: 100%" @change="handleSelectProduct">
            <el-option v-for="item in productChoices" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
          <div v-if="userStore.hasPermission('product:view')" class="form-hint">商品不存在？<el-link type="primary" :underline="false" @click="showDialog = false; router.push('/products')">去新建商品</el-link></div>
        </el-form-item>
        <el-form-item v-if="selectedProduct && skuOptions.length" label="选择规格" required>
          <el-select v-model="form.skuId" placeholder="请选择需要操作的规格" filterable style="width: 100%" :disabled="submitting">
            <el-option v-for="opt in skuOptions" :key="String(opt.value)" :label="opt.label" :value="opt.value">
              <div class="sku-option"><span>{{ opt.label }}</span><span class="muted">库存 {{ opt.stock }}</span></div>
            </el-option>
          </el-select>
          <div v-if="selectedSkuMeta" class="form-hint">当前库存 {{ selectedSkuMeta.stock }} · {{ selectedSkuMeta.low === 0 ? '已关闭提前预警' : '预警阈值 ' + selectedSkuMeta.low }}</div>
          <div v-else class="form-hint">选择规格后可填写数量</div>
        </el-form-item>
        <el-form-item :label="quantityLabel" required>
          <!-- 数值组件仅在挂载时设置无障碍禁用状态，切换规格或提交状态时同步重新挂载。 -->
          <el-input-number :key="[dialogType, form.skuId, Boolean(selectedSkuMeta), submitting].join(':')" v-model="form.quantity" :min="['stocktake', 'threshold'].includes(dialogType) ? 0 : 1" :max="Math.max(1, quantityLimit)" :precision="0" :disabled="submitting || !selectedSkuMeta || (dialogType === 'outbound' && quantityLimit === 0)" controls-position="right" />
          <div v-if="dialogType === 'outbound' && selectedSkuMeta" class="form-hint" :class="{ 'stock-out': selectedSkuMeta.stock === 0 }">{{ selectedSkuMeta.stock === 0 ? '该规格已缺货，无法出库' : '最多可出库 ' + selectedSkuMeta.stock }}</div>
        </el-form-item>
        <div v-if="stockPreview" class="stock-preview" aria-live="polite">
          <div><span>当前库存</span><strong>{{ stockPreview.before }}</strong></div>
          <el-icon><Right /></el-icon>
          <div><span>{{ dialogType === 'stocktake' ? '盘点后库存' : '操作后库存' }}</span><strong :class="{ 'stock-out': stockPreview.after === 0 }">{{ stockPreview.after ?? '—' }}</strong></div>
          <p v-if="stockPreview.change !== null">{{ stockPreview.change === 0 ? '库存不变' : (stockPreview.change > 0 ? '增加 ' : '减少 ') + Math.abs(stockPreview.change) }}</p>
          <p v-else>填写有效数量后显示结果</p>
        </div>
        <el-form-item v-if="dialogType !== 'threshold'" :label="dialogType === 'inbound' ? '备注' : '原因'" :required="dialogType !== 'inbound'">
          <el-input v-model="form.reason" type="textarea" :rows="3" :maxlength="500" show-word-limit :placeholder="dialogType === 'outbound' ? '请填写报损、领用等出库原因' : dialogType === 'stocktake' ? '请填写盘点差异或核对说明' : '可填写采购、补货等入库说明（选填）'" :disabled="submitting" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDialog = false" :disabled="submitting">取消</el-button>
        <el-button type="primary" @click="submitAction" :loading="submitting" :disabled="!canSubmit || detailLoading">{{ submitLabel }}</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="showHistoryDialog" :title="showHistoryTitle" size="min(1100px, 100vw)" class="inventory-history">
      <div class="history-toolbar">
        <el-radio-group v-model="historyQuery.type" aria-label="流水类型" @change="handleHistoryTypeChange" size="small">
          <el-radio-button label="">全部</el-radio-button>
          <el-radio-button label="inbound">入库</el-radio-button>
          <el-radio-button label="outbound">出库</el-radio-button>
          <el-radio-button label="stocktake">盘点</el-radio-button>
        </el-radio-group>
        <el-select v-if="historyQuery.productId && historySkuOptions.length" v-model="historyQuery.skuId" placeholder="全部规格" aria-label="流水规格" clearable filterable size="small" class="history-spec-select" @change="handleHistorySkuChange">
          <el-option v-for="opt in historySkuOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
        </el-select>
        <span class="muted history-total">共 {{ historyTotal }} 条记录</span>
      </div>
      <el-alert v-if="historyError" :title="historyError" type="warning" :closable="false" show-icon class="resource-alert">
        <template #default><el-button link type="primary" @click="fetchHistory">重新加载流水</el-button></template>
      </el-alert>
      <el-table :data="historyList" v-loading="historyLoading" stripe :empty-text="historyLoading ? '正在加载流水…' : historyError ? '暂时无法显示流水' : '当前筛选下暂无库存流水'">
        <el-table-column label="类型" width="80">
          <template #default="{ row }"><el-tag :type="row.type === 'inbound' ? 'success' : row.type === 'outbound' ? 'warning' : 'info'" size="small">{{ typeText(row.type) }}</el-tag></template>
        </el-table-column>
        <el-table-column label="规格编码" width="115" show-overflow-tooltip>
          <template #default="{ row }">{{ row.skuCode || '—' }}</template>
        </el-table-column>
        <el-table-column label="规格" min-width="120" show-overflow-tooltip>
          <template #default="{ row }">{{ specsLabel(row) || '—' }}</template>
        </el-table-column>
        <el-table-column label="变动数量" width="95" align="right">
          <template #default="{ row }"><strong :class="delta(row) < 0 ? 'stock-out' : delta(row) > 0 ? 'stock-in' : 'muted'">{{ delta(row) > 0 ? '+' : delta(row) < 0 ? '-' : '' }}{{ Math.abs(delta(row)) }}</strong></template>
        </el-table-column>
        <el-table-column label="库存变化" width="135" align="center">
          <template #default="{ row }"><div class="history-stock-change"><span class="muted">{{ row.previousStock ?? '—' }}</span><el-icon><Right /></el-icon><strong>{{ row.currentStock ?? '—' }}</strong></div></template>
        </el-table-column>
        <el-table-column label="原因 / 备注" min-width="180" align="left" show-overflow-tooltip>
          <template #default="{ row }">{{ row.reason || '—' }}</template>
        </el-table-column>
        <el-table-column label="操作人" width="100" show-overflow-tooltip>
          <template #default="{ row }">{{ row.operator || '—' }}</template>
        </el-table-column>
        <el-table-column label="操作时间" width="170">
          <template #default="{ row }"><span class="history-time">{{ formatDateTime(row.time || row.createdAt) || '—' }}</span></template>
        </el-table-column>
      </el-table>
      <template #footer>
        <div class="history-footer">
          <el-pagination background layout="prev, pager, next" :total="historyTotal" :page-size="historyQuery.pageSize" :current-page="historyQuery.page" @current-change="handleHistoryPageChange" small />
          <el-button @click="showHistoryDialog = false">关闭</el-button>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.warehouse-page { min-width: 0; color: #1e293b; }
.warehouse-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
.warehouse-heading h2 { margin: 0; font-size: 24px; font-weight: 600; color: #0f172a; }
.warehouse-heading p { margin: 6px 0 0; color: #64748b; font-size: 14px; }
.heading-actions, .inventory-search, .row-actions { display: flex; align-items: center; gap: 10px; }
.heading-actions { flex-shrink: 0; }
.heading-actions :deep(.el-button + .el-button), .row-actions :deep(.el-button + .el-button), .inventory-search :deep(.el-button + .el-button) { margin-left: 0; }
.inventory-card { border-radius: 12px; border-color: #e2e8f0; }
.inventory-toolbar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; }
.inventory-search { width: 340px; max-width: 100%; }
.inventory-search :deep(.el-input) { flex: 1; min-width: 0; }
.inventory-note { margin: 14px 0 20px; color: #64748b; font-size: 12px; line-height: 1.7; }
.resource-alert { margin-bottom: 18px; }
.product-name { color: #0f172a; font-weight: 500; }
.stock-number { font-size: 16px; font-variant-numeric: tabular-nums; }
.stock-out { color: #dc2626; }
.stock-low { color: #b45309; }
.stock-in { color: #15803d; }
.muted { color: #64748b; font-size: 12px; }
.status-tags { display: flex; align-items: flex-start; flex-direction: column; gap: 5px; }
.row-actions { gap: 14px; white-space: nowrap; }
.row-actions :deep(.el-button) { padding: 4px 0; }
.row-actions :deep(.el-icon) { margin-left: 3px; }
.inventory-table :deep(.el-table__cell) { padding-top: 15px; padding-bottom: 15px; }
.inventory-table :deep(th.el-table__cell) { background: #f8fafc; color: #475569; }
.sku-panel { padding: 16px 20px 20px; background: #f8fafc; }
.sku-panel-heading { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; margin-bottom: 12px; font-size: 13px; }
.sku-panel-heading span { color: #64748b; font-size: 12px; }
.sku-panel :deep(.sku-out-row) { --el-table-tr-bg-color: #fff1f2; }
.sku-panel :deep(.sku-low-row) { --el-table-tr-bg-color: #fffbeb; }
.inventory-pagination { display: flex; justify-content: flex-end; overflow-x: auto; margin-top: 20px; }
.inventory-empty-action { display: flex; justify-content: center; padding: 8px 0 20px; }
.form-hint { width: 100%; margin-top: 5px; color: #64748b; font-size: 12px; line-height: 1.6; }
.form-hint :deep(.el-link) { font-size: 12px; }
.sku-option { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.stock-preview { display: grid; grid-template-columns: 1fr 24px 1fr; align-items: center; text-align: center; gap: 6px 12px; padding: 16px; margin: 0 0 20px; border: 1px solid #dbeafe; border-radius: 8px; background: #eff6ff; }
.stock-preview div { display: flex; flex-direction: column; gap: 5px; }
.stock-preview span { color: #475569; font-size: 12px; }
.stock-preview strong { font-size: 24px; line-height: 1.3; font-variant-numeric: tabular-nums; }
.stock-preview > .el-icon { color: #94a3b8; }
.stock-preview p { grid-column: 1 / -1; margin: 5px 0 0; color: #475569; font-size: 12px; }
.history-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
.history-spec-select { width: 220px; }
.history-total { margin-left: auto; }
.history-stock-change { display: flex; align-items: center; justify-content: center; gap: 10px; }
.history-stock-change .el-icon { color: #94a3b8; }
.history-time { color: #64748b; font-size: 12px; }
.history-footer { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px; }
@media (max-width: 760px) {
  .warehouse-heading { align-items: flex-start; flex-direction: column; }
  .warehouse-heading h2 { font-size: 22px; }
  .inventory-search { width: 100%; }
  .inventory-card :deep(.el-card__body) { padding: 16px; }
  .inventory-note { margin-bottom: 14px; }
  .sku-panel { padding: 12px; }
  .history-total { margin-left: 0; }
}
</style>
