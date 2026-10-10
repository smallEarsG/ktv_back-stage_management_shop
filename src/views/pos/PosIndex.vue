<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { Search, Check, Plus, Minus, Delete, ShoppingCart } from '@element-plus/icons-vue'
import request from '@/lib/request'
import { useUserStore } from '@/stores/user'
import { ElMessage } from 'element-plus'
import dayjs from 'dayjs'
import CashierPaymentDialog from '@/components/CashierPaymentDialog.vue'
import RoomBalanceDialog from '@/components/RoomBalanceDialog.vue'
import CashierMemberPicker from '@/components/CashierMemberPicker.vue'
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
const roomKeyword = ref('')
const selectedRoom = ref(null)
const roomTypes = computed(() => [...new Set(rooms.value.map(room => room.type).filter(Boolean))])
const filteredRooms = computed(() => {
  const keyword = roomKeyword.value.trim().toLowerCase()
  return rooms.value.filter(room => (!roomType.value || room.type === roomType.value)
    && (!keyword || String(room.roomNumber || room.id).toLowerCase().includes(keyword)))
})
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
const selectedMemberId = ref(null), selectedCouponId = ref(null), walletCode = ref(''), marketingQuote = ref(null)
const cashDialogVisible = ref(false), cashQuoteLoading = ref(false), cashQuoteAmount = ref(0), cashQuoteBody = ref(null)
const cashReceived = ref(undefined), cashConfirmed = ref(false), cashQuoteError = ref('')
const lastCashReceived = ref(null), lastCashChange = ref(null)
const changeAmount = computed(() => cashChange(cashQuoteAmount.value, cashReceived.value))
watch(cashReceived, () => { cashConfirmed.value = false }, { flush: 'sync' })
const selectCashReceived = amount => {
  if (submitting.value || cashQuoteLoading.value || !cashQuoteBody.value || amount < cashQuoteAmount.value) return
  cashReceived.value = amount
}
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
  return label || '默认规格'
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
const cartQuantity = computed(() => cartItems.value.reduce((sum, item) => sum + Number(item.qty || 0), 0))
const productQuantity = product => {
  const skuIds = new Set((product.skus || []).map(sku => String(sku.id)))
  return cartItems.value.reduce((sum, item) => sum + (skuIds.has(String(item.skuId)) ? Number(item.qty) : 0), 0)
}

const loadRooms = async () => {
  roomsLoading.value = true
  roomsError.value = ''
  try {
    const res = await request.get('/rooms', { silent: true })
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
    capabilityError.value = '扫码支付暂不可用，可使用现金收款或记入房间账单。'
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
const searchProducts = () => {
  productKeyword.value = productKeyword.value.trim()
  if (productPage.value !== 1) productPage.value = 1
  else loadProducts()
}

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
    ElMessage.error('该商品暂无可选规格，无法加入')
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
    ElMessage.error('请选择规格')
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
const removeCartLine = item => {
  if (!cashierLocked.value) cartItems.value = cartItems.value.filter(line => line !== item)
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

const clientOrderNo = () => {
  const uid = currentUserId.value || '0'
  const id = globalThis.crypto?.randomUUID?.() || `${dayjs().format('YYYYMMDD-HHmmss')}-${Math.floor(Math.random() * 100000000)}`
  return `cashier-${uid}-${id}`
}

const buildOrderBody = (payMethod) => {
  if (![1, 2, 3, 4].includes(payMethod)) return null
  if (payMethod === 4 && (!selectedMemberId.value || !walletCode.value)) { ElMessage.warning('请先选择会员，并输入会员出示的付款码'); return null }
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
    memberId: selectedMemberId.value || null,
    couponId: selectedCouponId.value || null,
    walletCode: payMethod === 4 ? walletCode.value : undefined,

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
  selectedCouponId.value = null; walletCode.value = ''; marketingQuote.value = null
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
  if (!confirmedBody) {
    submitting.value = true
    try { const quote = await request.post('/cashier/quote', body); if (disposed) return; marketingQuote.value = quote; body.expectedAmount = quote.amountTotal }
    catch { return }
    finally { submitting.value = false }
  }
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
    marketingQuote.value = result
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
  <div class="cashier-page" v-loading="submitting" element-loading-text="正在确认订单，请勿重复提交">
    <header class="cashier-heading">
      <div><h2>收银台</h2><p>选择房间、添加商品，再收款或记账。切换房间会自动保存清单。</p></div>
      <span class="cashier-heading-note">现场收银 · 配送点单请使用顾客端</span>
    </header>
    <div v-if="storageError || submitError || pendingSubmission || capabilityError || balanceError || submittedOrder" class="cashier-notices">
      <el-alert v-if="storageError" :title="storageError" type="warning" :closable="false" show-icon />
      <el-alert v-if="submitError" :title="submitError" type="error" :closable="false" show-icon />
      <div v-if="pendingSubmission" class="pending-notice">
        <span>{{ pendingSubmission.roomId }} 有一笔待确认订单，商品和原单号已保留。</span>
        <div><el-button size="small" :loading="submitting" @click="recoverSubmission(false)">查询原订单</el-button><el-button size="small" :loading="submitting" @click="recoverSubmission(true)">使用原单号重试</el-button></div>
      </div>
      <div v-if="capabilityError" class="inline-notice"><span>{{ capabilityError }}</span><el-button link type="primary" @click="loadCapabilities">重试</el-button></div>
      <div v-if="balanceError" class="inline-notice"><span>{{ balanceError }}</span><el-button link type="primary" @click="loadBalances">刷新账款</el-button></div>
      <div v-if="submittedOrder" class="receipt-notice">
        <el-alert :title="`${submittedOrder.orderNo || submittedOrder.orderId}：${receipt.text}`" :type="receipt.type" :closable="false" show-icon />
        <p v-if="lastCashReceived !== null && lastCashChange !== null">实收 ¥ {{ Number(lastCashReceived).toFixed(2) }} · 找零 ¥ {{ lastCashChange.toFixed(2) }}</p>
        <el-button v-if="Number(submittedOrder.payMethod) === 1 && Number(submittedOrder.payStatus) !== 2 && Number(submittedOrder.status) === 10" size="small" @click="payDialogInfo = submittedOrder; payDialogVisible = true">继续原订单支付 / 查询</el-button>
      </div>
    </div>
    <div class="cashier-layout">
      <section class="cashier-panel room-panel" aria-labelledby="room-panel-title">
        <div class="panel-heading"><h3 id="room-panel-title">选择房间</h3><span>{{ filteredRooms.length }} / {{ rooms.length }}</span></div>
        <div class="room-filters">
          <el-input v-model="roomKeyword" placeholder="搜索房号" aria-label="搜索房号或桌号" :prefix-icon="Search" clearable />
          <el-select v-model="roomType" placeholder="全部类型" aria-label="房间类型" clearable>
            <el-option label="全部类型" value="" /><el-option v-for="type in roomTypes" :key="type" :label="type" :value="type" />
          </el-select>
        </div>
        <el-alert v-if="roomsError" :title="roomsError" type="error" :closable="false"><el-button size="small" @click="loadRooms">重试房间</el-button></el-alert>
        <div v-loading="roomsLoading" class="room-list">
          <el-empty v-if="!roomsLoading && !roomsError && !filteredRooms.length" :image-size="54" description="没有匹配的房间">
            <el-button size="small" @click="roomKeyword = ''; roomType = ''">清除筛选</el-button>
          </el-empty>
          <div v-for="r in filteredRooms" :key="r.id" class="room-entry" :class="{ 'is-selected': String(selectedRoom?.id) === String(r.id), 'is-unavailable': r.isAvailable === false }">
            <button type="button" class="room-pick" :aria-pressed="String(selectedRoom?.id) === String(r.id)" :disabled="cashierLocked" @click="chooseRoom(r)">
              <div class="room-name"><strong>{{ r.roomNumber || r.id }}</strong><el-icon v-if="String(selectedRoom?.id) === String(r.id)"><Check /></el-icon></div>
              <div class="room-meta"><span>{{ r.type || '房间' }}</span><el-tag :type="r.isAvailable === false ? 'info' : 'success'" size="small" effect="light">{{ roomStatusText(r) }}</el-tag></div>
              <div v-if="drafts[r.roomNumber]?.length" class="room-draft">已保存 {{ drafts[r.roomNumber].length }} 种商品</div>
              <div v-if="!balanceError && roomBalances[r.roomNumber]?.pendingPaymentCount" class="room-pending">待扫码付款 {{ roomBalances[r.roomNumber].pendingPaymentCount }} 单</div>
            </button>
            <button v-if="!balanceError && roomBalances[r.roomNumber]?.unsettledCount" type="button" class="room-account" :disabled="cashierLocked" @click="openRoomBalance(r)">
              <span>待结 {{ roomBalances[r.roomNumber].unsettledCount }} 单</span><strong>¥ {{ roomBalances[r.roomNumber].unsettledAmount.toFixed(2) }} <span aria-hidden="true">›</span></strong>
            </button>
          </div>
        </div>
      </section>

      <section class="cashier-panel product-panel" aria-labelledby="product-panel-title">
        <div class="panel-heading"><h3 id="product-panel-title">选择商品</h3><span>点击商品加入清单</span></div>
        <div class="product-search">
          <el-input v-model="productKeyword" placeholder="搜索商品名称" aria-label="搜索商品名称" :prefix-icon="Search" clearable @keyup.enter="searchProducts" @clear="searchProducts" />
          <el-button @click="searchProducts">搜索</el-button>
        </div>
        <div class="category-tabs" aria-label="商品分类">
          <button type="button" :class="{ active: !activeCategoryId }" :aria-pressed="!activeCategoryId" @click="activeCategoryId = ''">全部商品</button>
          <button v-for="cat in categories" :key="cat.id" type="button" :class="{ active: String(activeCategoryId) === String(cat.id) }" :aria-pressed="String(activeCategoryId) === String(cat.id)" @click="activeCategoryId = String(cat.id)">{{ cat.name }}</button>
        </div>
        <el-alert v-if="categoriesError" :title="categoriesError" type="warning" :closable="false"><el-button :loading="categoriesLoading" size="small" @click="loadCategories">重试分类</el-button></el-alert>
        <el-alert v-if="productLoadError" :title="productLoadError" type="error" :closable="false"><el-button size="small" @click="loadProducts">重试加载</el-button></el-alert>
        <div v-loading="productsLoading" class="product-scroll">
          <el-empty v-if="!productsLoading && !productLoadError && !products.length" :image-size="72" :description="productKeyword ? '没有找到匹配的商品' : '当前分类暂无商品'" />
          <div class="product-grid">
            <button v-for="p in products" :key="p.id" type="button" class="product-tile" :class="{ 'has-quantity': productQuantity(p) > 0 }" :disabled="cashierLocked" :aria-label="`选择${p.name}`" @click="openAddToCart(p)">
              <div class="product-name" :title="p.name">{{ p.name }}</div>
              <div class="product-category">{{ p.categoryName || '商品' }}</div>
              <div class="product-spec">{{ (p.skus || []).length > 1 ? `${p.skus.length} 种规格可选` : skuSpecsLabel(p.skus?.[0]) }}</div>
              <div class="product-tile-footer"><strong>¥ {{ Number(p.price || 0).toFixed(2) }}</strong><span v-if="productQuantity(p)" class="product-quantity">已选 {{ productQuantity(p) }}</span><span v-else class="product-add" aria-hidden="true"><el-icon><Plus /></el-icon></span></div>
            </button>
          </div>
        </div>
        <div class="product-pagination"><el-pagination v-model:current-page="productPage" :page-size="24" :total="productTotal" :pager-count="5" layout="total, prev, pager, next" small /></div>
      </section>

      <section class="cashier-panel cart-panel" aria-labelledby="cart-panel-title">
        <CashierMemberPicker v-model:member-id="selectedMemberId" v-model:coupon-id="selectedCouponId" v-model:wallet-code="walletCode" :disabled="cashierLocked" />
        <div class="cart-heading">
          <div><span class="cart-heading-label">当前房间</span><h3 id="cart-panel-title">{{ selectedRoom?.roomNumber || '未选择房间' }}<el-tag v-if="selectedRoom?.isAvailable === false" type="info" size="small">不可用</el-tag></h3></div>
          <el-button link type="danger" :disabled="cashierLocked || !cartItems.length" @click="clearCart">清空</el-button>
        </div>
        <div class="cart-list">
          <div v-if="!cartItems.length" class="cart-empty"><el-icon :size="34"><ShoppingCart /></el-icon><strong>尚未选择商品</strong><p>从商品区添加商品<br>清单会按房间自动保存</p></div>
          <div v-for="(it, i) in cartItems" :key="i" class="cart-line">
            <div class="cart-line-top"><strong :title="it.productName">{{ it.productName }}</strong><span class="line-total">¥ {{ (Number(it.price) * Number(it.qty)).toFixed(2) }}</span></div>
            <p class="cart-spec">{{ it.skuLabel === '默认SKU' ? '默认规格' : it.skuLabel }}</p>
            <p v-if="Object.keys(it.selectedAttrs || {}).length" class="cart-spec">{{ Object.entries(it.selectedAttrs).map(([k, v]) => `${k}：${Array.isArray(v) ? v.join('/') : v}`).join('，') }}</p>
            <div class="cart-line-controls">
              <span class="unit-price">¥ {{ Number(it.price).toFixed(2) }} / 件</span>
              <div class="quantity-controls"><el-button :icon="Minus" :disabled="cashierLocked" :aria-label="`减少${it.productName}数量`" @click="decQty(it)" /><span>{{ it.qty }}</span><el-button :icon="Plus" :disabled="cashierLocked" :aria-label="`增加${it.productName}数量`" @click="incQty(it)" /><el-button class="remove-line" :icon="Delete" :disabled="cashierLocked" :aria-label="`移除${it.productName}`" @click="removeCartLine(it)" /></div>
            </div>
          </div>
        </div>
        <div class="cart-footer">
          <div class="cart-total"><div><span>本次合计</span><p>{{ cartItems.length }} 种商品 · {{ cartQuantity }} 件</p></div><strong>¥ {{ cartTotalAmount.toFixed(2) }}</strong></div>
          <p v-if="selectedRoom?.isAvailable === false" class="checkout-warning">当前房间不可用，请选择可用房间。</p>
          <div class="checkout-actions">
            <el-button v-if="selectedMemberId" :loading="submitting" :disabled="cashierLocked || !walletCode || !cartItems.length || selectedRoom?.isAvailable === false" @click="createCashierOrder(4)">会员钱包付款</el-button>
            <el-button class="cash-action" type="primary" :loading="submitting" :disabled="cashierLocked || !cartItems.length || selectedRoom?.isAvailable === false" @click="openCashConfirmation">现金收款</el-button>
            <el-button :loading="submitting" :disabled="cashierLocked || !cartItems.length || selectedRoom?.isAvailable === false" @click="createCashierOrder(3)">记入房间账单</el-button>
            <el-button :loading="submitting" :disabled="cashierLocked || !wechatEnabled || !cartItems.length || selectedRoom?.isAvailable === false" :title="wechatEnabled ? '微信扫码收款' : '扫码收款暂不可用'" @click="createCashierOrder(1)">扫码收款</el-button>
          </div>
          <p class="checkout-help">现金收款：确认已收现金。<br>记入房间账单：先记账，稍后结算。</p>
        </div>
      </section>
    </div>
  </div>

  <el-dialog v-model="skuDialogVisible" title="选择商品规格" width="min(520px, 94vw)">
    <div v-if="skuDialogProduct" class="space-y-3">
      <div class="font-semibold text-slate-800">{{ skuDialogProduct.name }}</div>
      <el-form label-width="90px">
        <el-form-item label="规格" v-if="skuOptionsOfProduct.length > 1">
          <el-select v-model="skuDialogSkuId" placeholder="请选择规格" filterable class="w-full"><el-option v-for="s in skuOptionsOfProduct" :key="s.id" :label="skuSpecsLabel(s)" :value="String(s.id)" /></el-select>
        </el-form-item>
        <template v-for="item in attrConfigOfSelectedSku" :key="item.name">
          <el-form-item :label="item.name" :required="Boolean(item.required)">
            <el-radio-group v-if="item.type !== 'multi'" v-model="skuDialogAttrs[item.name]" class="flex flex-wrap gap-2"><el-radio v-for="opt in item.options" :key="opt" :label="opt">{{ opt }}</el-radio></el-radio-group>
            <el-checkbox-group v-else v-model="skuDialogAttrs[item.name]" class="flex flex-wrap gap-2"><el-checkbox v-for="opt in item.options" :key="opt" :label="opt">{{ opt }}</el-checkbox></el-checkbox-group>
          </el-form-item>
        </template>
        <el-form-item label="数量"><el-input-number v-model="skuDialogQty" :min="1" /></el-form-item>
      </el-form>
    </div>
    <template #footer><el-button @click="skuDialogVisible = false">取消</el-button><el-button type="primary" @click="addSkuDialogToCart">加入清单</el-button></template>
  </el-dialog>

  <el-dialog v-model="cashDialogVisible" class="cash-confirm-dialog" title="确认现金收款" width="min(520px, 94vw)" :close-on-click-modal="false" :close-on-press-escape="!submitting && !cashQuoteLoading" :show-close="!submitting && !cashQuoteLoading">
    <div v-loading="cashQuoteLoading" class="cash-confirm-body">
      <el-alert v-if="cashQuoteError" :title="cashQuoteError" type="error" :closable="false" />
      <template v-if="cashQuoteBody">
        <div class="cash-summary"><div><span>收款房间</span><strong>{{ cashQuoteBody.roomId }}</strong></div><div class="cash-due"><span>本次应收</span><strong>¥ {{ cashQuoteAmount.toFixed(2) }}</strong></div></div>
        <div v-if="marketingQuote" class="my-3 text-sm text-slate-600"><p v-for="b in marketingQuote.benefits" :key="`${b.type}-${b.id}`">{{ b.name }} <span v-if="Number(b.amount)">：减 ¥ {{ Number(b.amount).toFixed(2) }}</span></p><p v-for="g in marketingQuote.gifts" :key="g.skuId">赠送 {{ g.name }} × {{ g.qty }}</p></div>
        <el-form label-position="top" class="cash-form"><el-form-item label="实收现金"><el-input-number v-model="cashReceived" :min="0" :precision="2" :controls="false" :disabled="submitting" placeholder="请输入收到的现金金额" aria-label="实收现金" /></el-form-item></el-form>
        <div class="cash-shortcuts"><el-button :disabled="submitting" :type="cashReceived === cashQuoteAmount ? 'primary' : 'default'" plain @click="selectCashReceived(cashQuoteAmount)">刚好</el-button><el-button :disabled="submitting || cashQuoteAmount > 50" :type="cashReceived === 50 ? 'primary' : 'default'" plain @click="selectCashReceived(50)">50 元</el-button><el-button :disabled="submitting || cashQuoteAmount > 100" :type="cashReceived === 100 ? 'primary' : 'default'" plain @click="selectCashReceived(100)">100 元</el-button></div>
        <div class="cash-change" :class="{ ready: changeAmount !== null }"><span>应找零</span><strong>{{ changeAmount === null ? '—' : `¥ ${changeAmount.toFixed(2)}` }}</strong></div>
        <p v-if="changeAmount === null" class="cash-input-hint">{{ cashReceived === undefined || cashReceived === null ? '填写实收金额后自动计算找零。' : '实收金额不足，请核对收到的现金。' }}</p>
        <el-checkbox v-model="cashConfirmed" :disabled="submitting" class="cash-confirm-check">已核对房间、应收金额，并收到上述现金</el-checkbox>
      </template>
    </div>
    <template #footer><div class="cash-dialog-actions"><el-button :disabled="submitting || cashQuoteLoading" @click="cashDialogVisible = false">取消</el-button><el-button type="primary" :loading="submitting" :disabled="cashQuoteLoading || !cashQuoteBody || !cashConfirmed || changeAmount === null" @click="confirmCashOrder">确认收款</el-button></div></template>
  </el-dialog>
  <RoomBalanceDialog v-model="balanceDialogVisible" :room-id="balanceRoomId" @settled="loadBalances" />
  <CashierPaymentDialog v-model="payDialogVisible" :order-id="payDialogInfo?.orderId || payDialogInfo?.id" @updated="paymentUpdated" @confirmed="paymentConfirmed" />
</template>

<style scoped>
.cashier-page { display: flex; flex: 1; flex-direction: column; gap: 14px; min-width: 0; min-height: 500px; container-type: inline-size; }
.cashier-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-shrink: 0; }
.cashier-heading h2 { font-size: 23px; font-weight: 700; color: #0f172a; }
.cashier-heading p { margin-top: 4px; color: #64748b; font-size: 13px; }
.cashier-heading-note { color: #64748b; font-size: 12px; white-space: nowrap; }
.cashier-notices { display: grid; gap: 6px; flex-shrink: 0; max-height: 150px; overflow-y: auto; }
.pending-notice, .inline-notice { display: flex; align-items: center; justify-content: space-between; gap: 12px; border: 1px solid #fde68a; border-radius: 8px; padding: 8px 12px; background: #fffbeb; color: #92400e; font-size: 13px; }
.pending-notice { flex-wrap: wrap; }
.receipt-notice { display: flex; align-items: center; gap: 12px; }
.receipt-notice .el-alert { flex: 1; min-width: 0; }
.receipt-notice p { color: #475569; font-size: 13px; white-space: nowrap; }
.cashier-layout { display: grid; grid-template-columns: 200px minmax(0, 1fr) 330px; gap: 14px; flex: 1; min-height: 0; }
.cashier-panel { display: flex; flex-direction: column; min-height: 0; min-width: 0; overflow: hidden; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; }
.panel-heading { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 16px; flex-shrink: 0; }
.panel-heading h3 { color: #1e293b; font-size: 15px; font-weight: 700; }
.panel-heading > span { color: #94a3b8; font-size: 12px; white-space: nowrap; }
.room-filters { display: grid; gap: 8px; padding: 0 12px 12px; flex-shrink: 0; }
.room-filters .el-select { width: 100%; }
.room-list { display: grid; align-content: start; grid-auto-rows: max-content; gap: 8px; flex: 1; overflow-y: auto; min-height: 0; padding: 0 12px 12px; }
.room-entry { min-width: 0; border: 1px solid #e2e8f0; border-radius: 9px; background: #fff; overflow: hidden; }
.room-entry.is-selected { border-color: #2563eb; background: #eff6ff; box-shadow: inset 3px 0 #2563eb; }
.room-pick { display: block; width: 100%; padding: 12px; text-align: left; transition: background .15s; }
.room-pick:hover:not(:disabled) { background: #f1f5f9; }
.room-pick:disabled, .room-account:disabled { cursor: not-allowed; }
.room-pick:focus-visible, .room-account:focus-visible, .product-tile:focus-visible, .category-tabs button:focus-visible { outline: 2px solid #2563eb; outline-offset: -3px; }
.room-name { display: flex; justify-content: space-between; align-items: center; gap: 6px; color: #1e293b; }
.room-name strong { font-size: 17px; overflow-wrap: anywhere; }
.room-name .el-icon { color: #2563eb; }
.room-meta { display: flex; justify-content: space-between; align-items: center; margin-top: 7px; color: #64748b; font-size: 12px; }
.is-unavailable .room-name { color: #94a3b8; }
.room-draft, .room-pending { margin-top: 7px; font-size: 12px; }
.room-draft { color: #2563eb; }
.room-pending { color: #b45309; }
.room-account { display: flex; align-items: center; justify-content: space-between; gap: 4px; width: 100%; border-top: 1px solid #fde68a; background: #fffbeb; padding: 9px 10px; color: #92400e; font-size: 12px; }
.room-account:hover:not(:disabled) { background: #fef3c7; }
.room-account strong { white-space: nowrap; }
.product-search { display: flex; gap: 8px; padding: 0 16px 12px; flex-shrink: 0; }
.category-tabs { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; padding: 0 16px 12px; flex-shrink: 0; }
.category-tabs::-webkit-scrollbar { display: none; }
.category-tabs button { white-space: nowrap; font-size: 13px; color: #475569; border-radius: 7px; background: #f1f5f9; padding: 7px 12px; }
.category-tabs button:hover { background: #e2e8f0; }
.category-tabs button.active { background: #2563eb; color: #fff; }
.product-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 0 16px 16px; }
.product-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
.product-tile { display: flex; flex-direction: column; min-width: 0; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; background: #fff; text-align: left; transition: border-color .15s, background .15s; }
.product-tile:hover:not(:disabled) { border-color: #93c5fd; background: #f8fbff; }
.product-tile.has-quantity { border-color: #93c5fd; background: #f8fbff; }
.product-tile:disabled { opacity: .55; cursor: not-allowed; }
.product-name { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 44px; line-height: 22px; color: #1e293b; font-size: 14px; font-weight: 600; overflow-wrap: anywhere; }
.product-category { margin-top: 5px; color: #94a3b8; font-size: 12px; }
.product-spec { margin-top: 10px; color: #64748b; font-size: 12px; }
.product-tile-footer { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px; margin-top: 12px; }
.product-tile-footer strong { color: #0f172a; font-size: 17px; white-space: nowrap; }
.product-add { display: flex; align-items: center; justify-content: center; height: 24px; width: 24px; border-radius: 7px; color: #2563eb; background: #eff6ff; }
.product-quantity { border-radius: 5px; padding: 3px 6px; font-size: 11px; color: #2563eb; background: #dbeafe; white-space: nowrap; }
.product-pagination { padding: 12px 10px; border-top: 1px solid #f1f5f9; flex-shrink: 0; overflow-x: auto; }
.product-pagination :deep(.el-pagination) { justify-content: center; }
.cart-heading { display: flex; justify-content: space-between; gap: 8px; padding: 16px 18px; border-bottom: 1px solid #e2e8f0; flex-shrink: 0; }
.cart-heading-label { color: #64748b; font-size: 12px; }
.cart-heading h3 { display: flex; align-items: center; gap: 8px; margin-top: 3px; color: #0f172a; font-size: 21px; font-weight: 700; overflow-wrap: anywhere; }
.cart-list { flex: 1; min-height: 0; overflow-y: auto; padding: 0 18px; }
.cart-empty { display: flex; align-items: center; flex-direction: column; justify-content: center; height: 100%; color: #94a3b8; text-align: center; }
.cart-empty strong { color: #64748b; font-size: 14px; margin-top: 8px; }
.cart-empty p { font-size: 12px; margin-top: 4px; line-height: 1.6; }
.cart-line { padding: 16px 0; border-bottom: 1px solid #f1f5f9; }
.cart-line:last-child { border-bottom: 0; }
.cart-line-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.cart-line-top > strong { color: #1e293b; font-size: 14px; overflow-wrap: anywhere; }
.line-total { flex-shrink: 0; color: #1e293b; font-size: 14px; font-weight: 600; }
.cart-spec { font-size: 12px; color: #64748b; margin-top: 5px; overflow-wrap: anywhere; }
.cart-line-controls { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 12px; }
.unit-price { color: #94a3b8; font-size: 12px; white-space: nowrap; }
.quantity-controls { display: flex; align-items: center; gap: 6px; }
.quantity-controls .el-button { width: 30px; height: 30px; padding: 0; margin: 0; }
.quantity-controls > span { min-width: 22px; text-align: center; font-size: 14px; font-variant-numeric: tabular-nums; }
.quantity-controls .remove-line { margin-left: 4px; color: #94a3b8; border: 0; }
.cart-footer { border-top: 1px solid #e2e8f0; padding: 16px 18px; flex-shrink: 0; background: #fff; }
.cart-total { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.cart-total span { font-size: 14px; font-weight: 600; color: #334155; }
.cart-total p { margin-top: 4px; font-size: 12px; color: #94a3b8; }
.cart-total > strong { color: #dc2626; font-size: 28px; font-weight: 700; font-variant-numeric: tabular-nums; }
.checkout-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 16px; }
.checkout-actions .el-button { margin: 0; width: 100%; height: 38px; padding: 0 8px; font-size: 13px; }
.checkout-actions .cash-action { grid-column: 1 / -1; height: 43px; font-size: 15px; font-weight: 600; }
.checkout-help { color: #64748b; font-size: 12px; line-height: 1.7; margin-top: 10px; }
.checkout-warning { color: #b45309; font-size: 12px; margin-top: 8px; }
.cash-confirm-body { min-height: 48px; }
.cash-summary { display: flex; align-items: center; justify-content: space-between; gap: 16px; border-radius: 10px; padding: 18px; background: #eff6ff; }
.cash-summary > div { display: flex; flex-direction: column; gap: 5px; }
.cash-summary span { color: #64748b; font-size: 12px; }
.cash-summary strong { color: #1e293b; font-size: 20px; overflow-wrap: anywhere; }
.cash-summary .cash-due { text-align: right; }
.cash-due strong { color: #dc2626; font-size: 30px; white-space: nowrap; }
.cash-form { margin-top: 20px; }
.cash-form :deep(.el-form-item) { margin-bottom: 10px; }
.cash-form :deep(.el-input-number) { width: 100%; }
.cash-form :deep(.el-input__wrapper) { height: 44px; }
.cash-form :deep(.el-input__inner) { text-align: left; font-size: 20px; }
.cash-shortcuts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.cash-shortcuts .el-button { margin: 0; height: 36px; }
.cash-change { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-top: 20px; padding: 14px 16px; background: #f8fafc; border-radius: 8px; color: #64748b; }
.cash-change strong { font-size: 26px; font-variant-numeric: tabular-nums; }
.cash-change.ready { color: #15803d; background: #f0fdf4; }
.cash-input-hint { color: #b45309; font-size: 12px; margin-top: 8px; }
.cash-confirm-check { height: auto; margin-top: 18px; white-space: normal; align-items: flex-start; }
.cash-confirm-check :deep(.el-checkbox__input) { margin-top: 4px; }
.cash-confirm-check :deep(.el-checkbox__label) { white-space: normal; line-height: 22px; }
.cash-dialog-actions { display: flex; gap: 10px; }
.cash-dialog-actions .el-button { height: 40px; margin: 0; }
.cash-dialog-actions .el-button:last-child { flex: 1; }
@container (max-width: 1040px) { .cashier-heading-note { display: none; } .cashier-layout { grid-template-columns: 184px minmax(0, 1fr) 316px; gap: 12px; } .product-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .product-tile { padding: 12px; } }
@container (max-width: 920px) { .cashier-layout { grid-template-columns: 156px minmax(0, 1fr) 280px; } .panel-heading { padding: 14px 12px; } .panel-heading > span { font-size: 11px; } .room-pick { padding: 10px; } .room-name strong { font-size: 16px; } .room-account { flex-wrap: wrap; padding: 7px 8px; } .room-account strong { margin-left: auto; } .cart-heading, .cart-footer { padding: 14px; } .cart-list { padding: 0 14px; } .cart-total > strong { font-size: 26px; } .checkout-actions .el-button { font-size: 12px; } .checkout-actions .cash-action { font-size: 15px; } .product-tile-footer strong { font-size: 15px; } }
@container (max-width: 740px) { .cashier-layout { grid-template-columns: minmax(0, 1fr) 280px; grid-template-rows: auto minmax(400px, 1fr); min-height: 660px; } .room-panel { grid-column: 1 / -1; } .room-panel .panel-heading { padding: 12px 14px; } .room-filters { grid-template-columns: minmax(0, 1fr) 160px; } .room-list { display: flex; min-height: 144px; max-height: 156px; padding-bottom: 12px; } .room-entry { flex: 0 0 170px; } .room-name strong { font-size: 15px; } .room-list .el-empty { margin: auto; padding: 8px; } .room-list :deep(.el-empty__image) { display: none; } .room-list :deep(.el-empty__description) { margin-top: 0; } }
@container (max-width: 650px) { .cashier-layout { display: flex; flex-direction: column; flex: none; min-height: 0; } .product-scroll { max-height: 420px; min-height: 180px; flex: none; } .cart-list { max-height: 350px; min-height: 160px; flex: none; } .cart-panel { flex-shrink: 0; } .product-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .cashier-heading p { line-height: 1.7; } .receipt-notice { flex-wrap: wrap; } .receipt-notice .el-alert { flex-basis: 100%; } }
</style>
