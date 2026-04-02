<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { Search } from '@element-plus/icons-vue'
import request from '@/lib/request'
import { useUserStore } from '@/stores/user'
import { ElMessage } from 'element-plus'
import dayjs from 'dayjs'

const userStore = useUserStore()

const rooms = ref([])
const roomsLoading = ref(false)
const roomType = ref('')
const selectedRoom = ref(null)
const roomLocalStatus = reactive({})

const categories = ref([])
const categoriesLoading = ref(false)
const activeCategoryId = ref('')
const products = ref([])
const productsLoading = ref(false)
const productKeyword = ref('')

const cartItems = ref([])

const skuDialogVisible = ref(false)
const skuDialogProduct = ref(null)
const skuDialogSkuId = ref('')
const skuDialogAttrs = reactive({})
const skuDialogQty = ref(1)

const payDialogVisible = ref(false)
const payDialogInfo = ref(null)

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

const currentStoreId = computed(() => userStore.currentStoreId || '')
const currentUserId = computed(() => userStore.userInfo?.id || userStore.userInfo?.userId || '')

const loadRooms = async () => {
  roomsLoading.value = true
  try {
    const res = await request.get('/rooms', { params: { type: roomType.value || undefined } })
    rooms.value = res.list || []
    if (!selectedRoom.value && rooms.value.length) {
      selectedRoom.value = rooms.value[0]
    }
  } catch (e) {
    console.error(e)
  } finally {
    roomsLoading.value = false
  }
}

const loadCategories = async () => {
  categoriesLoading.value = true
  try {
    const res = await request.get('/categories')
    categories.value = res.list || []
    if (!activeCategoryId.value && categories.value.length) {
      activeCategoryId.value = String(categories.value[0].id)
    }
  } catch (e) {
    console.error(e)
  } finally {
    categoriesLoading.value = false
  }
}

const loadProducts = async () => {
  productsLoading.value = true
  try {
    const res = await request.get('/products', {
      params: {
        page: 1,
        pageSize: 2000,
        categoryId: activeCategoryId.value || undefined,
        keyword: productKeyword.value || undefined
      }
    })
    products.value = res.list || []
  } catch (e) {
    console.error(e)
  } finally {
    productsLoading.value = false
  }
}

watch(activeCategoryId, () => {
  loadProducts()
})

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
  it.qty += 1
}

const decQty = (it) => {
  it.qty -= 1
  if (it.qty <= 0) {
    cartItems.value = cartItems.value.filter(x => x !== it)
  }
}

function clearCart() {
  cartItems.value = []
}

watch(selectedRoom, (val, oldVal) => {
  if (!val) return
  if (oldVal && String(oldVal?.id) !== String(val?.id)) {
    clearCart()
    skuDialogVisible.value = false
  }
})

const roomStatusText = (room) => {
  const key = String(room?.roomNumber ?? room?.id ?? '')
  return roomLocalStatus[key] || '空闲'
}

const roomStatusClass = (room) => {
  const s = roomStatusText(room)
  if (s === '未结算') return 'text-red-600'
  if (s === '已开单') return 'text-blue-600'
  return 'text-slate-400'
}

const clientOrderNo = () => {
  const uid = currentUserId.value || '0'
  return `cashier-${dayjs().format('YYYYMMDD-HHmmss')}-${uid}-${Math.floor(Math.random() * 10000)}`
}

const createCashierOrder = async (payMethod) => {
  if (!selectedRoom.value) {
    ElMessage.error('请先选择房间/桌号')
    return
  }
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
  const body = {
    storeId: Number(currentStoreId.value),
    roomId: roomNo,
    userId: Number(currentUserId.value),
    payMethod,
    clientOrderNo: clientOrderNo(),
    items: cartItems.value.map(it => ({
      skuId: Number(it.skuId),
      qty: Number(it.qty),
      selectedAttrs: it.selectedAttrs || {}
    }))
  }
  try {
    const res = await request.post('/cashier/orders', body)
    ElMessage.success(`开单成功：${res.orderNo || res.orderId}`)
    const roomKey = roomNo
    if (payMethod === 2) {
      roomLocalStatus[roomKey] = '空闲'
    } else if (payMethod === 1) {
      roomLocalStatus[roomKey] = '已开单'
    } else {
      roomLocalStatus[roomKey] = '未结算'
    }
    clearCart()
    if (payMethod === 1) {
      payDialogInfo.value = res
      payDialogVisible.value = true
    }
  } catch (e) {
    console.error(e)
  }
}

onMounted(async () => {
  await loadRooms()
  await loadCategories()
  await loadProducts()
})
</script>

<template>
  <div class="h-[calc(100vh-112px)]">
    <div class="mb-4">
      <h2 class="text-2xl font-bold text-slate-800">收银台</h2>
    </div>
    <div class="grid grid-cols-12 gap-4 h-full">
      <el-card class="col-span-12 lg:col-span-3 h-full" shadow="never">
        <template #header>
          <div class="flex justify-between items-center">
            <span class="font-bold">房间/桌号</span>
          </div>
        </template>
        <div v-loading="roomsLoading" class="space-y-2 overflow-y-auto max-h-[calc(100vh-220px)]">
          <div
            v-for="r in rooms"
            :key="r.id"
            class="p-3 border rounded cursor-pointer flex justify-between items-center"
            :class="String(selectedRoom?.id) === String(r.id) ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white'"
            @click="selectedRoom = r"
          >
            <div>
              <div class="font-semibold text-slate-800">{{ r.roomNumber || r.id }}</div>
              <div class="text-xs" :class="roomStatusClass(r)">{{ roomStatusText(r) }}</div>
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
            <el-input v-model="productKeyword" placeholder="搜索商品" class="w-56" :prefix-icon="Search" @keyup.enter="loadProducts" />
          </div>
        </template>

        <div v-loading="productsLoading" class="grid grid-cols-2 xl:grid-cols-3 gap-3 overflow-y-auto max-h-[calc(100vh-220px)]">
          <div
            v-for="p in products"
            :key="p.id"
            class="p-3 rounded border bg-white hover:border-blue-400 cursor-pointer"
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
            <span class="font-bold">已选商品</span>
            <el-button link type="danger" @click="clearCart">清空</el-button>
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
                <el-button size="small" @click="decQty(it)">-</el-button>
                <span class="w-8 text-center">{{ it.qty }}</span>
                <el-button size="small" @click="incQty(it)">+</el-button>
              </div>
            </div>
          </div>
        </div>
        <div class="mt-4 border-t pt-3">
          <div class="flex justify-between items-center text-lg font-bold">
            <span>合计</span>
            <span class="text-red-600">¥ {{ cartTotalAmount.toFixed(2) }}</span>
          </div>
          <div class="mt-3 grid grid-cols-3 gap-2">
            <el-button type="warning" @click="createCashierOrder(3)">挂账</el-button>
            <el-button type="primary" @click="createCashierOrder(1)">扫码支付</el-button>
            <el-button type="success" @click="createCashierOrder(2)">现金</el-button>
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

  <el-dialog v-model="payDialogVisible" title="扫码支付" width="420px">
    <div v-if="payDialogInfo" class="space-y-3">
      <div class="text-sm text-slate-600">订单号：<span class="font-mono text-slate-800">{{ payDialogInfo.orderNo || payDialogInfo.orderId }}</span></div>
      <div class="text-sm text-slate-600">金额：<span class="font-bold text-red-600">¥ {{ Number(payDialogInfo.amountTotal || 0).toFixed(2) }}</span></div>
      <div v-if="payDialogInfo.qrCodeUrl || payDialogInfo.qrUrl || payDialogInfo.payQrCodeUrl" class="flex justify-center">
        <img :src="payDialogInfo.qrCodeUrl || payDialogInfo.qrUrl || payDialogInfo.payQrCodeUrl" class="w-56 h-56 border rounded" />
      </div>
      <div v-else class="text-xs text-slate-500">
        后端暂未返回二维码图片地址，可用订单号在收银设备/小程序侧完成支付。
      </div>
    </div>
    <template #footer>
      <el-button type="primary" @click="payDialogVisible = false">关闭</el-button>
    </template>
  </el-dialog>
</template>
