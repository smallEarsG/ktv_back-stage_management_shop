<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { Search } from '@element-plus/icons-vue'
import request from '@/lib/request'
import { useUserStore } from '@/stores/user'
import { ElMessage } from 'element-plus'
import dayjs from 'dayjs'
import CashierPaymentDialog from '@/components/CashierPaymentDialog.vue'
import RoomBalanceDialog from '@/components/RoomBalanceDialog.vue'
import { cashierReceipt, recoveryKey } from '@/lib/cashier-result'
import { cashierWorkspaceKey, cloneCart, readCashierWorkspace, writeCashierWorkspace, cashChange, roomBalancesById } from '@/lib/cashier-workspace'

const userStore = useUserStore()
const currentStoreId = computed(() => userStore.currentStoreId || '')
const currentUserId = computed(() => userStore.userInfo?.id || userStore.userInfo?.userId || '')
const workspaceKey = cashierWorkspaceKey(currentStoreId.value, currentUserId.value)
const storageError = ref('')
let workspaceReadable = true
let restored = { drafts: {}, pending: null }
try { restored = readCashierWorkspace(localStorage, workspaceKey) } catch {
  workspaceReadable = false
  storageError.value = '草稿恢复信息无法读取，暂不能开新单，请联系店长核对原订单。'
}
const drafts = reactive(restored.drafts)
const pendingSubmission = ref(restored.pending)

const rooms = ref([])
const roomsLoading = ref(false)
const roomType = ref('')
const selectedRoom = ref(null)
const roomBalances = ref({})
const roomsError = ref(''), categoriesError = ref(''), balanceError = ref(''), capabilityError = ref('')
const balanceDialogVisible = ref(false), balanceRoomId = ref('')
let balanceTimer, disposed = false, balanceRequestId = 0

const categories = ref([])
const categoriesLoading = ref(false)
const activeCategoryId = ref('')
const products = ref([])
const productPage = ref(1)
const productTotal = ref(0)
const productsLoading = ref(false)
const productKeyword = ref('')
const productLoadError = ref('')
let productRequestId = 0

const cartItems = ref([])
const submitting = ref(false)
const submitError = ref('')
const submittedOrder = ref(null)
const cashDialogVisible = ref(false), cashQuoteLoading = ref(false), cashQuoteAmount = ref(0), cashQuoteBody = ref(null)
const cashReceived = ref(undefined), cashConfirmed = ref(false), cashQuoteError = ref('')
const lastCashReceived = ref(null), lastCashChange = ref(null)
const changeAmount = computed(() => cashChange(cashQuoteAmount.value, cashReceived.value))
const cashierLocked = computed(() => submitting.value || !!pendingSubmission.value || cashDialogVisible.value)
const persistWorkspace = () => {
  if (!workspaceReadable) return false
  try { writeCashierWorkspace(localStorage, workspaceKey, drafts, pendingSubmission.value); storageError.value = ''; return true }
  catch { storageError.value = '无法保存草稿和订单恢复信息，请检查浏览器存储后重试。'; return false }
}
watch(cartItems, items => {
  const room = selectedRoom.value?.roomNumber
  if (room) { drafts[room] = cloneCart(items); persistWorkspace() }
}, { deep: true, flush: 'sync' })


const skuDialogVisible = ref(false)
const skuDialogProduct = ref(null)
const skuDialogSkuId = ref('')
const skuDialogAttrs = reactive({})
const skuDialogQty = ref(1)

const payDialogVisible = ref(false)
const payDialogInfo = ref(null)
const wechatEnabled = ref(false)
const receipt = computed(() => cashierReceipt(submittedOrder.value))
const recoveryStorageKey = () => recoveryKey(userStore.currentStoreId, userStore.userInfo?.id)
const retainPayment = order => { try { sessionStorage.setItem(recoveryStorageKey(), String(order.orderId || order.id)) } catch { /* The order list remains the recovery entry. */ } }
const paymentUpdated = order => { submittedOrder.value = order; payDialogInfo.value = order; if (Number(order.payStatus) === 2 || Number(order.status) === 90) { try { sessionStorage.removeItem(recoveryStorageKey()) } catch { /* No stored state. */ } } }
const paymentConfirmed = async order => { paymentUpdated(order); await loadBalances() }
const recoverPayment = async () => {
  let id; try { id = sessionStorage.getItem(recoveryStorageKey()) } catch { return }
  if (!id || !/^[0-9]+$/.test(id)) return
  try { const order = await request.get(`/orders/${id}`); paymentUpdated(order) } catch { /* Keep the ID for an explicit retry from the order list. */ }
}

const skuSpecsObj = (sku) => {
  const raw = sku?.skuSpecs ?? sku?.sku_specs ?? sku?.specs
  if (!raw) return {}
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) return obj
    return {}
  } catch {
    return {}
  }
}

const skuSpecsLabel = (sku) => {
  const obj = skuSpecsObj(sku)
  const label = Object.values(obj).join(' / ')
  return label || '默认SKU'
}

const parseAttrConfig = (sku) => {
  const raw = (sku?.attrConfigJson ?? sku?.attr_config_json ?? '{}') || '{}'
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const requiresAttrSelection = (sku) => {
  const cfg = parseAttrConfig(sku)
  return cfg.length > 0
}

const skuOptionsOfProduct = computed(() => {
  const p = skuDialogProduct.value
  const skus = Array.isArray(p?.skus) ? p.skus : []
  return skus
})

const selectedSku = computed(() => {
  const skus = skuOptionsOfProduct.value
  const id = skuDialogSkuId.value
  return skus.find(s => String(s?.id) === String(id)) || null
})

const attrConfigOfSelectedSku = computed(() => {
  return selectedSku.value ? parseAttrConfig(selectedSku.value) : []
})

const cartTotalAmount = computed(() => {
  return cartItems.value.reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.qty) || 0), 0)
})

const loadRooms = async () => {
  roomsLoading.value = true
  roomsError.value = ''
  try {
    const res = await request.get('/rooms', { params: { type: roomType.value || undefined }, silent: true })
    if (disposed) return
    rooms.value = res.list || []
    if (!selectedRoom.value && rooms.value.length) {
      selectedRoom.value = rooms.value.find(room => room.roomNumber === pendingSubmission.value?.roomId)
        || rooms.value.find(room => drafts[room.roomNumber]?.length)
        || rooms.value.find(room => room.isAvailable !== false) || rooms.value[0]
    } else if (selectedRoom.value) {
      selectedRoom.value = rooms.value.find(room => String(room.id) === String(selectedRoom.value.id)) || null
    }
  } catch {
    roomsError.value = '房间加载失败，请重试。'
  } finally {
    roomsLoading.value = false
  }
}

const loadCategories = async () => {
  categoriesLoading.value = true
  categoriesError.value = ''
  try {
    const res = await request.get('/categories', { silent: true })
    if (disposed) return
    categories.value = res.list || []
    if (!activeCategoryId.value && categories.value.length) {
      activeCategoryId.value = String(categories.value[0].id)
    }
  } catch {
    categoriesError.value = '分类加载失败，可继续搜索商品或重试分类。'
  } finally {
    categoriesLoading.value = false
  }
}

const loadCapabilities = async () => {
  capabilityError.value = ''
  try {
    const result = await request.get('/payment/capabilities', { silent: true })
    if (!disposed) wechatEnabled.value = Boolean(result.wechat)
  } catch {
    wechatEnabled.value = false
    capabilityError.value = '扫码支付暂不可用，现金开单和挂账仍可使用。'
  }
}

const loadBalances = async () => {
  const version = ++balanceRequestId
  try {
    const result = await request.get('/orders/operations-summary', { silent: true })
    if (disposed || version !== balanceRequestId) return
    roomBalances.value = roomBalancesById(result.roomBalances)
    balanceError.value = ''
  } catch { if (!disposed && version === balanceRequestId) balanceError.value = '房间账款同步失败，暂无法确认最新待结金额。' }
}

const openRoomBalance = room => {
  balanceRoomId.value = String(room?.roomNumber || '')
  if (balanceRoomId.value) balanceDialogVisible.value = true
}

const loadProducts = async () => {
  const requestId = ++productRequestId
  productsLoading.value = true
  productLoadError.value = ''
  try {
    const res = await request.get('/products', {
      params: {
        page: productPage.value,
        pageSize: 24,
        categoryId: activeCategoryId.value || undefined,
        keyword: productKeyword.value || undefined
      }
    })
    if (requestId === productRequestId) { products.value = (res.list || []).filter(p => p.status !== false); productTotal.value = Number(res.total || 0) }
  } catch (e) {
    if (requestId === productRequestId) productLoadError.value = '商品加载失败，请检查后台服务并重试。'
  } finally {
    if (requestId === productRequestId) productsLoading.value = false
  }
}

watch(activeCategoryId, () => {
  productPage.value = 1
  loadProducts()
})

watch(productPage, loadProducts)

const ensureAttrsInit = (cfg) => {
  cfg.forEach(item => {
    const name = String(item?.name ?? '').trim()
    if (!name) return
    if (item.type === 'multi') {
      if (!Array.isArray(skuDialogAttrs[name])) skuDialogAttrs[name] = []
    } else {
      if (skuDialogAttrs[name] === undefined) skuDialogAttrs[name] = ''
    }
  })
}

const openAddToCart = (product) => {
  if (cashierLocked.value) return
  const skus = Array.isArray(product?.skus) ? product.skus : []
  if (!skus.length) {
    ElMessage.error('该商品没有SKU，无法加入')
    return
  }
  if (skus.length === 1 && !requiresAttrSelection(skus[0])) {
    addCartLine({
      productName: product.name,
      skuId: skus[0].id,
      skuLabel: skuSpecsLabel(skus[0]),
      price: skus[0].price,
      qty: 1,
      selectedAttrs: {}
    })
    return
  }
  skuDialogProduct.value = product
  skuDialogSkuId.value = skus.length === 1 ? String(skus[0].id) : ''
  Object.keys(skuDialogAttrs).forEach(k => delete skuDialogAttrs[k])
  skuDialogQty.value = 1
  if (skus.length === 1) {
    ensureAttrsInit(parseAttrConfig(skus[0]))
  }
  skuDialogVisible.value = true
}

watch(skuDialogSkuId, () => {
  Object.keys(skuDialogAttrs).forEach(k => delete skuDialogAttrs[k])
  const cfg = attrConfigOfSelectedSku.value
  ensureAttrsInit(cfg)
})

const validateSkuDialog = () => {
  const sku = selectedSku.value
  if (!sku) {
    ElMessage.error('请选择SKU')
    return false
  }
  const cfg = attrConfigOfSelectedSku.value
  for (const item of cfg) {
    const name = String(item?.name ?? '').trim()
    if (!name) continue
    if (!item.required) continue
    if (item.type === 'multi') {
      if (!Array.isArray(skuDialogAttrs[name]) || skuDialogAttrs[name].length === 0) {
        ElMessage.error(`请选择「${name}」`)
        return false
      }
    } else {
      if (!skuDialogAttrs[name]) {
        ElMessage.error(`请选择「${name}」`)
        return false
      }
    }
  }
  return true
}

const addSkuDialogToCart = () => {
  if (cashierLocked.value) return
  if (!validateSkuDialog()) return
  const product = skuDialogProduct.value
  const sku = selectedSku.value
  const selectedAttrs = {}
  const cfg = attrConfigOfSelectedSku.value
  cfg.forEach(item => {
    const name = String(item?.name ?? '').trim()
    if (!name) return
    selectedAttrs[name] = skuDialogAttrs[name]
  })
  addCartLine({
    productName: product?.name ?? '',
    skuId: sku?.id,
    skuLabel: skuSpecsLabel(sku),
    price: sku?.price,
    qty: skuDialogQty.value,
    selectedAttrs
  })
  skuDialogVisible.value = false
}

const cartKeyOf = (line) => {
  const attrs = line?.selectedAttrs ? JSON.stringify(line.selectedAttrs) : '{}'
  return `${line?.skuId || ''}__${attrs}`
}

const addCartLine = (line) => {
  if (cashierLocked.value) return
  const key = cartKeyOf(line)
  const existing = cartItems.value.find(it => cartKeyOf(it) === key)
  if (existing) {
    existing.qty += Number(line.qty) || 1
    return
  }
  cartItems.value.push({
    productName: line.productName || '',
    skuId: line.skuId,
    skuLabel: line.skuLabel || '',
    price: Number(line.price) || 0,
    qty: Number(line.qty) || 1,
    selectedAttrs: line.selectedAttrs || {}
  })
}

const incQty = (it) => {
  if (cashierLocked.value) return
  it.qty += 1
}

const decQty = (it) => {
  if (cashierLocked.value) return
  it.qty -= 1
  if (it.qty <= 0) {
    cartItems.value = cartItems.value.filter(x => x !== it)
  }
}

function clearCart() {
  if (cashierLocked.value) return
  cartItems.value = []
}

watch(selectedRoom, (val, oldVal) => {
  if (String(oldVal?.id || '') === String(val?.id || '')) return
  if (oldVal?.roomNumber) drafts[oldVal.roomNumber] = cloneCart(cartItems.value)
  cartItems.value = cloneCart(drafts[val?.roomNumber])
  skuDialogVisible.value = false
  persistWorkspace()
}, { flush: 'sync' })

const chooseRoom = room => {
  if (cashierLocked.value) { ElMessage.warning('请先完成当前订单的确认'); return }
  selectedRoom.value = room
}

const roomStatusText = (room) => {
  if (room?.isAvailable === false) return '不可用'
  return '可用'
}

const roomStatusClass = (room) => {
  return room?.isAvailable === false ? 'text-slate-400' : 'text-green-600'
}

const clientOrderNo = () => {
  const uid = currentUserId.value || '0'
  const id = globalThis.crypto?.randomUUID?.() || `${dayjs().format('YYYYMMDD-HHmmss')}-${Math.floor(Math.random() * 100000000)}`
  return `cashier-${uid}-${id}`
}

const buildOrderBody = (payMethod) => {
  if (![1, 2, 3].includes(payMethod)) return null
  if (payMethod === 1 && !wechatEnabled.value) { ElMessage.warning('微信商户参数尚未配置'); return }
  if (!selectedRoom.value) {
    ElMessage.error('请先选择房间/桌号')
    return
  }
  if (selectedRoom.value.isAvailable === false) { ElMessage.error('该房间当前不可用'); return null }
  if (!currentStoreId.value) {
    ElMessage.error('缺少storeId')
    return
  }
  if (!currentUserId.value) {
    ElMessage.error('缺少userId')
    return
  }
  if (!cartItems.value.length) {
    ElMessage.error('请先选择商品')
    return
  }
  const roomNo = String(selectedRoom.value?.roomNumber ?? '').trim()
  if (!roomNo) {
    ElMessage.error('房间号为空')
    return
  }
  return {
    storeId: Number(currentStoreId.value),
    roomId: roomNo,
    payMethod,

    items: cartItems.value.map(it => ({
      skuId: Number(it.skuId),
      qty: Number(it.qty),
      selectedAttrs: it.selectedAttrs || {}
    }))
  }
}

const finishSubmission = async (res, body) => {
  submittedOrder.value = res
  if (body.payMethod === 2) {
    lastCashReceived.value = body.cashReceived
    lastCashChange.value = cashChange(res.amountTotal, body.cashReceived)
  } else { lastCashReceived.value = null; lastCashChange.value = null }
  drafts[body.roomId] = []
  if (selectedRoom.value?.roomNumber === body.roomId) cartItems.value = []
  if (body.payMethod === 1 && Number(res.payStatus) !== 2 && Number(res.status) === 10) {
    payDialogInfo.value = res
    payDialogVisible.value = true
    retainPayment(res)
  }
  pendingSubmission.value = null
  persistWorkspace()
  submitError.value = ''
  cashDialogVisible.value = false
  ElMessage.success(`订单已确认：${res.orderNo || res.orderId}`)
  await loadBalances()
}

const postSubmission = async (body) => {
  submitting.value = true
  submitError.value = ''
  try {
    const res = await request.post('/cashier/orders', body, { silent: true })
    if (disposed) return
    await finishSubmission(res, body)
  } catch (e) {
    if (disposed) return
    if (e.definitive || [400, 401, 403, 409, 422].includes(e.response?.status)) {
      pendingSubmission.value = null
      persistWorkspace()
      submitError.value = e.response?.data?.message || e.message || '订单未创建，请检查商品和金额后重试。'
      cashDialogVisible.value = false
    } else {
      submitError.value = '提交结果尚未确认，原订单已保留。请先查询原订单，或使用原单号重试。'
      cashDialogVisible.value = false
    }
  } finally {
    submitting.value = false
  }
}

const createCashierOrder = async (payMethod, confirmedBody = null) => {
  if (submitting.value || pendingSubmission.value) return
  const body = confirmedBody || buildOrderBody(payMethod)
  if (!body) return
  if (payMethod === 2 && !confirmedBody) { await openCashConfirmation(); return }
  pendingSubmission.value = { ...body, clientOrderNo: clientOrderNo() }
  if (!persistWorkspace()) { pendingSubmission.value = null; ElMessage.error(storageError.value); return }
  submittedOrder.value = null
  lastCashReceived.value = null; lastCashChange.value = null
  await postSubmission(pendingSubmission.value)
}

const openCashConfirmation = async () => {
  if (cashierLocked.value) return
  const body = buildOrderBody(2)
  if (!body) return
  cashDialogVisible.value = true; cashQuoteLoading.value = true; cashQuoteError.value = ''
  cashQuoteBody.value = null; cashConfirmed.value = false; cashReceived.value = undefined
  try {
    const result = await request.post('/cashier/quote', body, { silent: true })
    if (!cashDialogVisible.value || disposed) return
    cashQuoteAmount.value = Number(result.amountTotal)
    cashQuoteBody.value = body
  } catch (e) { cashQuoteError.value = e.response?.data?.message || e.message || '核价失败，请关闭后重试。' }
  finally { cashQuoteLoading.value = false }
}

const confirmCashOrder = async () => {
  if (cashQuoteLoading.value || !cashQuoteBody.value || !cashConfirmed.value || changeAmount.value === null) return
  await createCashierOrder(2, { ...cashQuoteBody.value, expectedAmount: cashQuoteAmount.value, cashReceived: cashReceived.value })
}

const recoverSubmission = async (retry = false) => {
  if (!pendingSubmission.value || submitting.value) return
  const body = pendingSubmission.value
  submitting.value = true
  try {
    const order = await request.get('/orders/by-client-no', { params: { clientOrderNo: body.clientOrderNo }, silent: true })
    if (disposed) return
    if (order) { await finishSubmission(order, body); return }
    submitError.value = '尚未查到原订单，可使用原单号重试；恢复完成前暂停新开单。'
    if (retry) await postSubmission(body)
  } catch { submitError.value = '原订单暂时无法查询，请检查连接后重试；恢复信息已保留。' }
  finally { submitting.value = false }
}

onMounted(() => {
  loadRooms(); loadCategories(); loadProducts(); loadCapabilities(); loadBalances()
  if (pendingSubmission.value) recoverSubmission()
  else recoverPayment()
  balanceTimer = setInterval(loadBalances, 10000)
})
onBeforeUnmount(() => { disposed = true; productRequestId++; clearInterval(balanceTimer) })
</script>

<template>
  <div class="space-y-4" v-loading="submitting" element-loading-text="正在确认订单，请勿重复提交">
    <div class="mb-4">
      <h2 class="text-2xl font-bold text-slate-800">收银台</h2>
      <p class="mt-1 text-sm text-slate-500">切换房间自动保存草稿；现金开单核价后确认收款。需配送的点单请使用顾客端。</p>
      <el-alert v-if="storageError" :title="storageError" type="warning" :closable="false" class="mt-3" />
      <el-alert v-if="submitError" :title="submitError" type="error" :closable="false" class="mt-3" />
      <div v-if="pendingSubmission" class="mt-3 rounded border border-amber-200 bg-amber-50 p-3">
        <p class="text-sm">{{ pendingSubmission.roomId }} 有一笔待确认订单，正在保留原单号和商品。</p>
        <div class="mt-2 flex gap-2"><el-button :loading="submitting" @click="recoverSubmission(false)">查询原订单</el-button><el-button :loading="submitting" @click="recoverSubmission(true)">使用原单号重试</el-button></div>
      </div>
      <el-alert v-if="capabilityError" :title="capabilityError" type="warning" :closable="false" class="mt-3"><el-button size="small" @click="loadCapabilities">重试扫码配置</el-button></el-alert>
      <el-alert v-if="balanceError" :title="balanceError" type="warning" :closable="false" class="mt-3"><el-button size="small" @click="loadBalances">刷新账款</el-button></el-alert>
      <el-alert v-if="submittedOrder" :title="`${submittedOrder.orderNo || submittedOrder.orderId}：${receipt.text}`" :type="receipt.type" class="mt-3" />
      <p v-if="lastCashReceived !== null && lastCashChange !== null" class="mt-2 text-sm text-slate-600">实收现金 ¥ {{ Number(lastCashReceived).toFixed(2) }} · 找零 ¥ {{ lastCashChange.toFixed(2) }}</p>
      <el-button v-if="submittedOrder && Number(submittedOrder.payMethod) === 1 && Number(submittedOrder.payStatus) !== 2 && Number(submittedOrder.status) === 10" class="mt-3" @click="payDialogInfo = submittedOrder; payDialogVisible = true">继续原订单支付 / 查询</el-button>
    </div>
    <div class="grid grid-cols-12 gap-4 items-start">
      <el-card class="col-span-12 lg:col-span-3 h-full" shadow="never">
        <template #header>
          <div class="flex justify-between items-center">
            <span class="font-bold">房间/桌号</span>
          </div>
        </template>
        <el-alert v-if="roomsError" :title="roomsError" type="error" :closable="false" class="mb-3"><el-button size="small" @click="loadRooms">重试房间</el-button></el-alert>
        <div v-loading="roomsLoading" class="space-y-2 overflow-y-auto max-h-[calc(100vh-220px)]">
          <div
            v-for="r in rooms"
            :key="r.id"
            class="p-3 border rounded cursor-pointer flex justify-between items-center"
            :class="String(selectedRoom?.id) === String(r.id) ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white'"
            @click="chooseRoom(r)"
          >
            <div>
              <div class="font-semibold text-slate-800">{{ r.roomNumber || r.id }}</div>
              <div class="text-xs" :class="roomStatusClass(r)">{{ roomStatusText(r) }}</div>
              <div v-if="drafts[r.roomNumber]?.length" class="mt-1 text-xs text-blue-600">已保存 {{ drafts[r.roomNumber].length }} 种商品草稿</div>
              <div v-if="!balanceError && roomBalances[r.roomNumber]?.pendingPaymentCount" class="mt-1 text-xs text-amber-600">{{ roomBalances[r.roomNumber].pendingPaymentCount }} 单待扫码付款</div>
              <el-button v-if="!balanceError && roomBalances[r.roomNumber]?.unsettledCount" link type="warning" size="small" @click.stop="openRoomBalance(r)">挂账 {{ roomBalances[r.roomNumber].unsettledCount }} 单 · ¥ {{ roomBalances[r.roomNumber].unsettledAmount.toFixed(2) }}</el-button>
            </div>
            <div class="text-xs text-slate-400">{{ r.type }}</div>
          </div>
        </div>
      </el-card>

      <el-card class="col-span-12 lg:col-span-6 h-full" shadow="never">
        <template #header>
          <div class="flex justify-between items-center gap-2">
            <div class="flex gap-2 items-center overflow-x-auto">
              <el-button
                v-for="cat in categories"
                :key="cat.id"
                size="small"
                :type="String(activeCategoryId) === String(cat.id) ? 'primary' : 'default'"
                @click="activeCategoryId = String(cat.id)"
              >
                {{ cat.name }}
              </el-button>
            </div>
            <el-input v-model="productKeyword" placeholder="搜索商品" class="w-56" :prefix-icon="Search" @keyup.enter="productPage = 1; loadProducts()" />
          </div>
        </template>

        <el-alert v-if="categoriesError" :title="categoriesError" type="warning" :closable="false" class="mb-3"><el-button :loading="categoriesLoading" size="small" @click="loadCategories">重试分类</el-button></el-alert>
        <el-pagination v-model:current-page="productPage" :page-size="24" :total="productTotal" layout="total, prev, pager, next" class="mb-3" />
        <el-alert v-if="productLoadError" :title="productLoadError" type="error" :closable="false" class="mb-3"><el-button size="small" @click="loadProducts">重试加载</el-button></el-alert>
        <el-empty v-if="!productsLoading && !productLoadError && !products.length" description="当前分类暂无商品" />
        <div v-loading="productsLoading" class="grid grid-cols-2 xl:grid-cols-3 gap-3 overflow-y-auto max-h-[calc(100vh-220px)]">
          <div
            v-for="p in products"
            :key="p.id"
            class="p-3 rounded border bg-white hover:border-blue-400 cursor-pointer"
            :class="cashierLocked ? 'opacity-50 cursor-not-allowed' : ''"
            @click="openAddToCart(p)"
          >
            <div class="font-semibold text-slate-800 truncate">{{ p.name }}</div>
            <div class="mt-1 text-xs text-slate-500 truncate">{{ p.categoryName }}</div>
            <div class="mt-2 flex justify-between items-center">
              <div class="text-red-600 font-bold">¥ {{ Number(p.price || 0).toFixed(2) }}</div>
              <el-tag size="small" effect="plain">{{ (p.skus || []).length > 1 ? `${(p.skus || []).length} SKU` : '默认SKU' }}</el-tag>
            </div>
          </div>
        </div>
      </el-card>

      <el-card class="col-span-12 lg:col-span-3 h-full" shadow="never">
        <template #header>
          <div class="flex justify-between items-center">
            <span class="font-bold">{{ selectedRoom?.roomNumber || '未选房间' }} · 已选商品</span>
            <el-button link type="danger" :disabled="cashierLocked" @click="clearCart">清空</el-button>
          </div>
        </template>
        <div class="space-y-3 overflow-y-auto max-h-[calc(100vh-320px)]">
          <div v-if="!cartItems.length" class="text-slate-400 text-sm">请在中间选择商品加入购物车</div>
          <div v-for="(it, i) in cartItems" :key="i" class="p-3 rounded border bg-white">
            <div class="flex justify-between items-start gap-2">
              <div class="min-w-0">
                <div class="font-semibold text-slate-800 truncate">{{ it.productName }}</div>
                <div class="text-xs text-slate-500 truncate">{{ it.skuLabel }}</div>
                <div v-if="Object.keys(it.selectedAttrs || {}).length" class="text-xs text-slate-500 truncate">
                  {{ Object.entries(it.selectedAttrs).map(([k, v]) => `${k}:${Array.isArray(v) ? v.join('/') : v}`).join('，') }}
                </div>
              </div>
              <div class="text-right">
                <div class="text-red-600 font-bold">¥ {{ (Number(it.price) * Number(it.qty)).toFixed(2) }}</div>
              </div>
            </div>
            <div class="mt-2 flex justify-between items-center">
              <div class="text-xs text-slate-500">单价 ¥ {{ Number(it.price).toFixed(2) }}</div>
              <div class="flex items-center gap-2">
                <el-button size="small" :disabled="cashierLocked" @click="decQty(it)">-</el-button>
                <span class="w-8 text-center">{{ it.qty }}</span>
                <el-button size="small" :disabled="cashierLocked" @click="incQty(it)">+</el-button>
              </div>
            </div>
          </div>
        </div>
        <div class="mt-4 border-t pt-3">
          <div class="flex justify-between items-center text-lg font-bold">
            <span>合计</span>
            <span class="text-red-600">¥ {{ cartTotalAmount.toFixed(2) }}</span>
          </div>
          <div class="mt-3 flex flex-wrap gap-2">
            <el-button :loading="submitting" :disabled="cashierLocked || !cartItems.length || selectedRoom?.isAvailable === false" @click="createCashierOrder(3)">挂账开单</el-button>
            <el-button :disabled="cashierLocked || !wechatEnabled || !cartItems.length || selectedRoom?.isAvailable === false" :loading="submitting" :title="wechatEnabled ? '微信扫码收款' : '微信商户参数尚未配置'" @click="createCashierOrder(1)">扫码支付</el-button>
            <el-button type="primary" :loading="submitting" :disabled="cashierLocked || !cartItems.length || selectedRoom?.isAvailable === false" @click="openCashConfirmation">现金开单</el-button>
          </div>
        </div>
      </el-card>
    </div>
  </div>

  <el-dialog v-model="skuDialogVisible" title="选择规格/属性" width="520px">
    <div v-if="skuDialogProduct" class="space-y-3">
      <div class="font-semibold text-slate-800">{{ skuDialogProduct.name }}</div>
      <el-form label-width="90px">
        <el-form-item label="SKU" v-if="skuOptionsOfProduct.length > 1">
          <el-select v-model="skuDialogSkuId" placeholder="请选择SKU" filterable class="w-full">
            <el-option v-for="s in skuOptionsOfProduct" :key="s.id" :label="skuSpecsLabel(s)" :value="String(s.id)" />
          </el-select>
        </el-form-item>
        <template v-for="item in attrConfigOfSelectedSku" :key="item.name">
          <el-form-item :label="item.name" :required="Boolean(item.required)">
            <el-radio-group v-if="item.type !== 'multi'" v-model="skuDialogAttrs[item.name]" class="flex flex-wrap gap-2">
              <el-radio v-for="opt in item.options" :key="opt" :label="opt">{{ opt }}</el-radio>
            </el-radio-group>
            <el-checkbox-group v-else v-model="skuDialogAttrs[item.name]" class="flex flex-wrap gap-2">
              <el-checkbox v-for="opt in item.options" :key="opt" :label="opt">{{ opt }}</el-checkbox>
            </el-checkbox-group>
          </el-form-item>
        </template>
        <el-form-item label="数量">
          <el-input-number v-model="skuDialogQty" :min="1" />
        </el-form-item>
      </el-form>
    </div>
    <template #footer>
      <el-button @click="skuDialogVisible = false">取消</el-button>
      <el-button type="primary" @click="addSkuDialogToCart">加入购物车</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="cashDialogVisible" title="确认现金收款" width="min(480px, 94vw)" :close-on-click-modal="false" :close-on-press-escape="!submitting && !cashQuoteLoading" :show-close="!submitting && !cashQuoteLoading">
    <div v-loading="cashQuoteLoading">
      <el-alert v-if="cashQuoteError" :title="cashQuoteError" type="error" :closable="false" />
      <template v-if="cashQuoteBody">
        <p class="mb-3">房间：<strong>{{ cashQuoteBody.roomId }}</strong></p>
        <p class="mb-4">应收：<strong class="text-xl text-red-600">¥ {{ cashQuoteAmount.toFixed(2) }}</strong></p>
        <el-form label-width="90px">
          <el-form-item label="实收现金"><el-input-number v-model="cashReceived" :min="0" :precision="2" :controls="false" :disabled="submitting" placeholder="请输入实收金额" /></el-form-item>
          <el-form-item label="找零">{{ changeAmount === null ? '请填写足额现金' : `¥ ${changeAmount.toFixed(2)}` }}</el-form-item>
        </el-form>
        <el-checkbox v-model="cashConfirmed" :disabled="submitting">已核对房间、应收金额，并收到上述现金</el-checkbox>
      </template>
    </div>
    <template #footer><el-button :disabled="submitting || cashQuoteLoading" @click="cashDialogVisible = false">取消</el-button><el-button type="primary" :loading="submitting" :disabled="cashQuoteLoading || !cashQuoteBody || !cashConfirmed || changeAmount === null" @click="confirmCashOrder">确认收款并开单</el-button></template>
  </el-dialog>
  <RoomBalanceDialog v-model="balanceDialogVisible" :room-id="balanceRoomId" @settled="loadBalances" />
  <CashierPaymentDialog v-model="payDialogVisible" :order-id="payDialogInfo?.orderId || payDialogInfo?.id" @updated="paymentUpdated" @confirmed="paymentConfirmed" />
</template>
