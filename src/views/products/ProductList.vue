<script setup>
import { ref, onMounted, reactive, computed } from 'vue'
import { Plus, Edit, Delete, MoreFilled, Search } from '@element-plus/icons-vue'
import { ElMessageBox, ElMessage } from 'element-plus'
import request from '@/lib/request'

const activeCategory = ref('')
const showEditDialog = ref(false)
const showCategoryDialog = ref(false)
const showEditCategoryDialog = ref(false)
const categories = ref([])
const products = ref([])
const total = ref(0)
const loading = ref(false)
const allCategoryId = 'all'
const uploadFileList = ref([])
const showImagePreview = ref(false)
const previewImageUrl = ref('')
const maxImageSizeMB = 2
const showDetailDialog = ref(false)
const detailProduct = ref(null)
let skuKeySeed = 1
const showSkuAttrDialog = ref(false)
const skuAttrTarget = ref({ index: -1 })
const skuAttrDraft = ref([])
const queryParams = reactive({
  page: 1,
  pageSize: 20,
  keyword: ''
})

const productForm = reactive({
  id: null,
  name: '',
  categoryId: '',
  image: '',
  status: true,
  detail: '',
  hasSkus: false,
  specs: [],
  skus: []
})

const productFormRef = ref(null)
const productRules = {
  categoryId: [
    {
      validator: (rule, value, callback) => {
        if (!value || value === allCategoryId) {
          callback(new Error('请选择商品类型'))
        } else {
          callback()
        }
      },
      trigger: 'change'
    }
  ],
  name: [{ required: true, message: '请输入商品名称', trigger: 'blur' }]
}

const editCategoryForm = reactive({
  id: null,
  name: '',
  sort: 0,
  active: true
})
const addCategoryForm = reactive({
  name: '',
  sort: 0,
  active: true
})

const addSpec = () => {
  productForm.specs.push({ name: '', values: [], tempValue: '' })
}

const removeSpec = (index) => {
  productForm.specs.splice(index, 1)
  generateSkus()
}

const addSpecValue = (index) => {
  const spec = productForm.specs[index]
  if (spec.tempValue && !spec.values.includes(spec.tempValue)) {
    spec.values.push(spec.tempValue)
    spec.tempValue = ''
    generateSkus()
  }
}

const removeSpecValue = (index, vIndex) => {
  productForm.specs[index].values.splice(vIndex, 1)
  generateSkus()
}

const normalizeSpecs = (raw) => {
  if (raw === null || raw === undefined) return {}
  let specs = raw
  if (typeof specs === 'string') {
    try {
      specs = JSON.parse(specs)
    } catch {
      return {}
    }
  }
  if (Array.isArray(specs)) return {}
  if (specs && typeof specs === 'object') return specs
  return {}
}

const normalizeSku = (sku, fallbackThreshold = 10) => {
  const specsRaw = sku?.specs ?? sku?.skuSpecs ?? sku?.sku_specs ?? sku?.skuSpecs
  const attrJson = sku?.attrConfigJson ?? sku?.attr_config_json ?? (typeof sku?.attrConfig === 'string' ? sku?.attrConfig : '')
  return {
    id: sku?.id ?? null,
    __key: sku?.id ? null : (sku?.__key ?? `sku_${skuKeySeed++}`),
    specs: normalizeSpecs(specsRaw),
    price: Number(sku?.price) || 0,
    stock: Number(sku?.stock ?? sku?.stockQuantity ?? sku?.stock_quantity ?? sku?.stockQuantity) || 0,
    lowStockThreshold: Number(sku?.lowStockThreshold ?? fallbackThreshold) || 0,
    skuCode: sku?.skuCode ?? sku?.sku_code ?? sku?.code ?? '',
    attrConfigJson: typeof attrJson === 'string' && attrJson.trim() ? attrJson : '{}',
    attrConfig: Array.isArray(sku?.attrConfig) ? sku.attrConfig : null
  }
}

const normalizeProduct = (p) => {
  const baseThreshold = Number(p?.lowStockThreshold ?? 10) || 10
  const rawSkus = Array.isArray(p?.skus) ? p.skus : []
  const skus = rawSkus.map(s => normalizeSku(s, baseThreshold))
  if (!skus.length) {
    skus.push({
      id: null,
      __key: `sku_${skuKeySeed++}`,
      specs: {},
      price: Number(p?.price) || 0,
      stock: Number(p?.stock) || 0,
      lowStockThreshold: baseThreshold,
      skuCode: '',
      attrConfigJson: '{}',
      attrConfig: null
    })
  }
  const specList = Array.isArray(p?.specList) ? p.specList : []
  const hasSpecs = specList.length > 0 || skus.some(s => Object.keys(s?.specs || {}).length > 0)
  return {
    ...p,
    price: Number(p?.price ?? 0) || 0,
    stock: Number(p?.stock ?? 0) || 0,
    lowStockThreshold: Number(p?.lowStockThreshold ?? baseThreshold) || baseThreshold,
    skus,
    specList,
    hasSpecs
  }
}

const generateSkus = () => {
  const specs = productForm.specs.filter(s => s.name && s.values.length > 0)
  if (specs.length === 0) {
    const existing = productForm.skus?.[0]
    productForm.skus = [
      {
        id: existing?.id ?? null,
        __key: existing?.__key ?? `sku_${skuKeySeed++}`,
        specs: {},
        price: Number(existing?.price) || 0,
        stock: Number(existing?.stock) || 0,
        lowStockThreshold: Number(existing?.lowStockThreshold ?? 10) || 10,
        skuCode: existing?.skuCode ?? ''
      }
    ]
    return
  }

  const combinations = specs.reduce((acc, spec) => {
    if (acc.length === 0) {
      return spec.values.map(v => ({ [spec.name]: v }))
    }
    const next = []
    acc.forEach(item => {
      spec.values.forEach(v => {
        next.push({ ...item, [spec.name]: v })
      })
    })
    return next
  }, [])

  productForm.skus = combinations.map(combo => {
    // Try to find existing SKU to preserve values
    const existing = productForm.skus.find(sku => {
       // Simple check if specs match
       if (!sku.specs) return false
       const keys = Object.keys(combo)
       if (keys.length !== Object.keys(sku.specs).length) return false
       return keys.every(k => sku.specs[k] === combo[k])
    })
    return {
      id: existing?.id ?? null,
      __key: existing?.__key ?? `sku_${skuKeySeed++}`,
      specs: combo,
      price: existing?.price ?? 0,
      stock: existing?.stock ?? 0,
      lowStockThreshold: existing?.lowStockThreshold ?? 10,
      skuCode: existing?.skuCode ?? existing?.code ?? '',
      attrConfigJson: (existing?.attrConfigJson && String(existing.attrConfigJson).trim()) ? String(existing.attrConfigJson).trim() : '{}',
      attrConfig: existing?.attrConfig ?? null
    }
  })
}

const fetchCategories = async () => {
  try {
    const res = await request.get('/categories')
    const list = res.list || res.data?.list || []
    categories.value = list.slice().sort((a, b) => (a?.sort ?? 0) - (b?.sort ?? 0))
    if (!activeCategory.value) {
      activeCategory.value = allCategoryId
      fetchProducts()
    }
  } catch (e) {
    console.log('fetchCategories:', e)
    console.error(e)
  }
}

const fetchProducts = async () => {
  loading.value = true
  try {
    const params = { ...queryParams }
    if (activeCategory.value && activeCategory.value !== allCategoryId) {
      params.categoryId = activeCategory.value
    }
    const res = await request.get('/products', {
      params
    })
    products.value = (res.list || []).map(normalizeProduct)
    total.value = res.total || 0
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

const handleAdd = () => {
  productForm.id = null
  productForm.name = ''
  productForm.categoryId =
    activeCategory.value && activeCategory.value !== allCategoryId
      ? String(activeCategory.value)
      : (categories.value?.[0]?.id ? String(categories.value[0].id) : '')
  productForm.image = ''
  productForm.status = true
  productForm.detail = ''
  productForm.hasSkus = false
  productForm.specs = []
  productForm.skus = [
    {
      id: null,
      __key: `sku_${skuKeySeed++}`,
      specs: {},
      price: 0,
      stock: 0,
      lowStockThreshold: 10,
      skuCode: '',
      attrConfigJson: '{}',
      attrConfig: null
    }
  ]
  uploadFileList.value = []
  showEditDialog.value = true
}

const handleEdit = (row) => {
  const p = normalizeProduct({ ...row })
  productForm.id = p.id ?? null
  productForm.name = p.name ?? ''
  productForm.categoryId =
    p.categoryId !== undefined && p.categoryId !== null && String(p.categoryId) !== allCategoryId
      ? String(p.categoryId)
      : (activeCategory.value && activeCategory.value !== allCategoryId ? String(activeCategory.value) : (categories.value?.[0]?.id ? String(categories.value[0].id) : ''))
  productForm.image = p.image ?? p.image_url ?? ''
  productForm.status = Boolean(p.status ?? true)
  productForm.detail = p.detail ?? ''
  const names = Array.isArray(p.specList) && p.specList.length ? p.specList.map(s => s.name) : getSpecNames(p)
  productForm.hasSkus = Boolean(p.hasSpecs && names.length)
  const valuesMap = {}
  ;(p.skus || []).forEach(sku => {
    const specsObj = sku.specs || {}
    names.forEach(n => {
      const v = specsObj?.[n]
      if (v !== undefined) {
        ;(valuesMap[n] = valuesMap[n] || []).push(v)
      }
    })
  })
  productForm.specs = productForm.hasSkus
    ? names.map(n => ({
        name: n || '',
        values: Array.from(new Set(valuesMap[n] || [])),
        tempValue: ''
      }))
    : []
  productForm.skus = (p.skus || []).map(sku => normalizeSku(sku, 10))
  if (!productForm.skus.length) {
    productForm.skus = [
      {
        id: null,
        __key: `sku_${skuKeySeed++}`,
        specs: {},
        price: 0,
        stock: 0,
        lowStockThreshold: 10,
        skuCode: '',
        attrConfigJson: '{}',
        attrConfig: null
      }
    ]
  }
  uploadFileList.value = (p.image || p.image_url) ? [{ name: p.name || 'image', url: p.image || p.image_url }] : []
  showEditDialog.value = true
}

const openProductDetail = (row) => {
  detailProduct.value = normalizeProduct({ ...row })
  showDetailDialog.value = true
}
const handleDelete = async (row) => {
  try {
    await ElMessageBox.confirm(`确定删除商品「${row.name}」吗？该操作不可恢复。`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    })
    const token = localStorage.getItem('token') || ''
    const storeId = localStorage.getItem('storeId') || ''
    await request.delete(`/products/${row.id}`, {
      headers: {
        Authorization: token ? `Bearer ${token}` : '',
        'X-Store-Id': storeId || ''
      }
    })
    ElMessage.success('操作成功')
    fetchProducts()
  } catch (e) {
    if (e !== 'cancel') {
      console.error(e)
      ElMessage.error('删除失败')
    }
  }
}
const saveProduct = async () => {
  try {
    const valid = await productFormRef.value?.validate?.()
    if (!valid) return
    if (!Array.isArray(productForm.skus) || productForm.skus.length === 0) {
      ElMessage.error('至少需要 1 条SKU')
      return
    }
    const intFieldsOk = (v) => Number.isInteger(Number(v)) && Number(v) >= 0
    for (const sku of productForm.skus) {
      const price = Number(sku.price)
      if (!Number.isFinite(price) || price < 0) {
        ElMessage.error('SKU价格不合法')
        return
      }
      if (!intFieldsOk(sku.stock)) {
        ElMessage.error('SKU库存不合法')
        return
      }
      if (!intFieldsOk(sku.lowStockThreshold)) {
        ElMessage.error('SKU预警阈值不合法')
        return
      }
      const cfg = sku?.attrConfig
      const rawTxt = (sku?.attrConfigJson || '{}').trim() || '{}'
      if (cfg && !Array.isArray(cfg)) {
        ElMessage.error('SKU属性配置不合法')
        return
      }
      if (!cfg && rawTxt) {
        try {
          JSON.parse(rawTxt)
        } catch {
          ElMessage.error('SKU属性配置不合法')
          return
        }
      }
    }
    const totalStock = productForm.skus.reduce((sum, s) => sum + (Number(s.stock) || 0), 0)
    const minPrice = Math.min(...productForm.skus.map(s => Number(s.price) || 0))
    const minThreshold = Math.min(...productForm.skus.map(s => Number(s.lowStockThreshold) || 0))
    const payload = {
      name: productForm.name,
      categoryId: productForm.categoryId,
      image: productForm.image,
      detail: productForm.detail,
      active: Boolean(productForm.status),
      specList: productForm.hasSkus ? productForm.specs.map(s => ({ name: s.name, values: s.values })) : [],
      skus: productForm.skus.map(s => ({
        id: s.id ?? null,
        specs: productForm.hasSkus ? (s.specs || {}) : [],
        price: Number(s.price) || 0,
        stock: Number(s.stock) || 0,
        lowStockThreshold: Number(s.lowStockThreshold) || 0,
        skuCode: s.skuCode ?? '',
        attrConfigJson: Array.isArray(s.attrConfig) ? JSON.stringify(s.attrConfig) : ((s.attrConfigJson || '{}').trim() || '{}')
      })),
      price: minPrice === Infinity ? 0 : minPrice,
      stock: totalStock,
      lowStockThreshold: minThreshold === Infinity ? 10 : minThreshold
    }
    if (productForm.id) {
      await request.put(`/products/${productForm.id}`, payload)
      ElMessage.success('更新成功')
    } else {
      await request.post('/products', payload)
      ElMessage.success('创建成功')
    }
    showEditDialog.value = false
    fetchProducts()
  } catch (e) {
    console.error(e)
  }
}

const handleAddCategory = async () => {
  if (!addCategoryForm.name.trim()) {
    ElMessage.warning('请输入分类名称')
    return
  }
  try {
    await request.post('/categories', { name: addCategoryForm.name.trim(), sort: addCategoryForm.sort, active: addCategoryForm.active })
    ElMessage.success('分类添加成功')
    showCategoryDialog.value = false
    fetchCategories()
  } catch (e) {
    console.error(e)
  }
}

const handleOpenAddCategory = () => {
  addCategoryForm.name = ''
  addCategoryForm.sort = 0
  addCategoryForm.active = true
  showCategoryDialog.value = true
}

const handleEditCategory = (cat) => {
  editCategoryForm.id = cat.id
  editCategoryForm.name = cat.name || ''
  editCategoryForm.sort = Number.isFinite(cat.sort) ? cat.sort : 0
  editCategoryForm.active = cat.active !== false
  showEditCategoryDialog.value = true
}

const handleSaveCategory = async () => {
  if (!editCategoryForm.name.trim()) {
    ElMessage.warning('请输入分类名称')
    return
  }
  try {
    await request.put(`/categories/${editCategoryForm.id}`, {
      name: editCategoryForm.name.trim(),
      sort: editCategoryForm.sort,
      active: editCategoryForm.active
    })
    ElMessage.success('分类更新成功')
    showEditCategoryDialog.value = false
    await fetchCategories()
  } catch (e) {
    console.error(e)
  }
}

const handleDeleteCategory = (id, name) => {
  ElMessageBox.confirm(
    `确定要删除分类 "${name}" 吗?`,
    '警告',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    }
  ).then(async () => {
    try {
      await request.delete(`/categories/${id}`)
      ElMessage.success('删除成功')
      if (activeCategory.value?.toString() === id?.toString()) {
        activeCategory.value = allCategoryId
        fetchProducts()
      }
      await fetchCategories()
    } catch (e) {
      console.error(e)
    }
  }).catch(() => {})
}

const beforeUpload = (file) => {
  const isImage = file.type && file.type.startsWith('image/')
  if (!isImage) {
    ElMessage.warning('仅支持图片文件')
    return false
  }
  const sizeMB = file.size / 1024 / 1024
  if (sizeMB >= maxImageSizeMB) {
    ElMessage.warning(`图片大小不能超过 ${maxImageSizeMB}MB`)
    return false
  }
  return true
}

const handleUploadRequest = async (options) => {
  try {
    const formData = new FormData()
    formData.append('file', options.file)
    const res = await request.post('/common/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    const imageUrl = res?.url || res?.path || res?.image || res
    if (typeof imageUrl !== 'string' || !imageUrl) {
      throw new Error('上传失败')
    }
    productForm.image = imageUrl
    uploadFileList.value = [{ name: options.file.name, url: imageUrl }]
    options.onSuccess && options.onSuccess(res)
  } catch (e) {
    options.onError && options.onError(e)
    ElMessage.error('上传失败')
  }
}

const handleRemoveImage = () => {
  productForm.image = ''    
  uploadFileList.value = []
}

const handlePreviewImage = (file) => {
  previewImageUrl.value = file.url
  showImagePreview.value = true
}

const handleUploadExceed = () => {
  ElMessage.warning('仅允许上传一张图片')
}

const onSelectCategory = (index) => {
  activeCategory.value = index
  fetchProducts()
}

const displayTotalStock = computed(() => {
  return productForm.skus.reduce((sum, sku) => sum + (Number(sku.stock) || 0), 0)
})

const displayMinPrice = computed(() => {
  if (!productForm.skus.length) return 0
  const min = Math.min(...productForm.skus.map(sku => Number(sku.price) || 0))
  return min === Infinity ? 0 : min
})

const getRowClass = ({ row }) => {
  const threshold = Number(row.lowStockThreshold ?? 10)
  return Number(row.stock) < threshold ? 'bg-red-50' : ''
}

const getSpecNames = (product) => {
  const fromList = Array.isArray(product?.specList) ? product.specList.map(s => s.name) : []
  if (fromList.length) return fromList
  const firstSpecs = product?.skus?.[0]?.specs
  return firstSpecs && typeof firstSpecs === 'object' ? Object.keys(firstSpecs) : []
}

const getSkuAttrItems = (sku) => {
  if (Array.isArray(sku?.attrConfig)) return sku.attrConfig
  const raw = (sku?.attrConfigJson || '').trim()
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const getAttrNames = (items) => {
  if (!Array.isArray(items)) return []
  return items.map(it => String(it?.name ?? '').trim()).filter(Boolean)
}

const getProductAttrSummary = (product) => {
  const names = new Set()
  const skus = Array.isArray(product?.skus) ? product.skus : []
  for (const sku of skus) {
    for (const n of getAttrNames(getSkuAttrItems(sku))) {
      names.add(n)
    }
  }
  const list = Array.from(names)
  return { count: list.length, names: list }
}

const normalizeAttrItems = (items) => {
  if (!Array.isArray(items)) return []
  return items.map(it => ({
    name: String(it?.name ?? '').trim(),
    type: it?.type === 'multi' ? 'multi' : 'single',
    required: Boolean(it?.required),
    options: Array.isArray(it?.options) ? it.options.map(v => String(v)).filter(Boolean) : [],
    tempOption: ''
  }))
}

const openSkuAttrDialog = (index) => {
  skuAttrTarget.value = { index }
  const sku = productForm.skus?.[index]
  let items = []
  if (Array.isArray(sku?.attrConfig)) {
    items = sku.attrConfig
  } else {
    const raw = (sku?.attrConfigJson || '').trim()
    if (raw) {
      try {
        const parsed = JSON.parse(raw)
        items = Array.isArray(parsed) ? parsed : []
      } catch {
        items = []
      }
    }
  }
  skuAttrDraft.value = normalizeAttrItems(items)
  showSkuAttrDialog.value = true
}

const applySkuAttrDialog = () => {
  const idx = skuAttrTarget.value?.index ?? -1
  if (idx < 0 || !productForm.skus?.[idx]) {
    showSkuAttrDialog.value = false
    return
  }
  const items = (skuAttrDraft.value || []).map(it => ({
    name: String(it?.name ?? '').trim(),
    type: it?.type === 'multi' ? 'multi' : 'single',
    required: Boolean(it?.required),
    options: Array.isArray(it?.options) ? it.options.map(v => String(v)).filter(Boolean) : []
  }))
  for (const it of items) {
    if (!it.name) {
      ElMessage.error('属性名不能为空')
      return
    }
    if (!Array.isArray(it.options) || it.options.length === 0) {
      ElMessage.error(`属性「${it.name}」至少需要 1 个选项`)
      return
    }
  }
  productForm.skus[idx].attrConfig = items
  productForm.skus[idx].attrConfigJson = items.length ? JSON.stringify(items) : '{}'
  showSkuAttrDialog.value = false
}

const addAttrItem = () => {
  skuAttrDraft.value = skuAttrDraft.value || []
  skuAttrDraft.value.push({
    name: '',
    type: 'single',
    required: false,
    options: [],
    tempOption: ''
  })
}

const removeAttrItem = (i) => {
  skuAttrDraft.value.splice(i, 1)
}

const addAttrOption = (i) => {
  const item = skuAttrDraft.value?.[i]
  if (!item) return
  const opt = String(item.tempOption || '').trim()
  if (!opt) return
  item.options = item.options || []
  if (!item.options.includes(opt)) item.options.push(opt)
  item.tempOption = ''
}

const removeAttrOption = (i, oi) => {
  const item = skuAttrDraft.value?.[i]
  if (!item?.options) return
  item.options.splice(oi, 1)
}


onMounted(() => {
  fetchCategories()
})
</script>

<template>
  <div class="flex gap-4 h-full">
    <!-- Category Sidebar (Simplified as Card) -->
    <el-card class="flex-shrink-0 w-56" :body-style="{ padding: '0' }">
      <div class="flex justify-between items-center p-4 font-bold border-b bg-slate-50">
        <span>商品分类</span>
        <el-button link type="primary" :icon="Plus" size="small" @click="handleOpenAddCategory"></el-button>
      </div>
      <el-menu :default-active="activeCategory" class="border-none" @select="onSelectCategory">
        <el-menu-item :index="allCategoryId">全部</el-menu-item>
        <el-menu-item v-for="cat in categories" :key="cat.id" :index="cat.id.toString()" class="flex justify-between items-center pr-2 group">
         {{cat.name }} 
          <div class="flex gap-1 items-center">
            <el-button 
              link 
              type="primary" 
              :icon="Edit" 
              size="small" 
              class="opacity-0 transition-opacity group-hover:opacity-100"
              @click.stop="handleEditCategory(cat)"
            ></el-button>
          <el-button 
            link 
            type="danger" 
            :icon="Delete" 
            size="small" 
            class="opacity-0 transition-opacity group-hover:opacity-100"
            @click.stop="handleDeleteCategory(cat.id, cat.name)"
          ></el-button>
          </div>
        </el-menu-item>
      </el-menu>
    </el-card>

    <!-- Product List -->
    <el-card class="flex-1">
      <template #header>
        <div class="flex justify-between items-center">
          <span class="font-bold">商品列表</span>
          <div class="flex gap-2 items-center">
            <el-input
              v-model="queryParams.keyword"
              placeholder="搜索商品"
              class="w-64"
              clearable
              :prefix-icon="Search"
              @keyup.enter="fetchProducts"
              @clear="fetchProducts"
            />
            <el-button type="primary" :icon="Plus" @click="handleAdd">新增商品</el-button>
          </div>
        </div>
      </template>

      <el-table :data="products" style="width: 100%" v-loading="loading" size="small" :row-class-name="getRowClass" :row-key="row => row.id || row.productId || row.code || row.name">
        <el-table-column prop="image" label="图片" width="80">
          <template #default="{ row }">
             <el-image :src="row.image" class="w-10 h-10 rounded bg-slate-200" fit="cover">
               <template #error>
                 <div class="flex justify-center items-center w-full h-full text-slate-400">
                   <el-icon><MoreFilled /></el-icon>
                 </div>
               </template>
             </el-image>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="商品名称" />
        <el-table-column prop="detail" label="详情" min-width="220" show-overflow-tooltip />
        <el-table-column label="规格" min-width="160">
          <template #default="{ row }">
            <template v-if="row.hasSpecs">
              <div class="flex flex-wrap gap-1 items-center">
                <el-tag
                  v-for="(spec, i) in (row.specList || [])"
                  :key="i"
                  size="small"
                  effect="plain"
                >
                  {{ spec.name }}: {{ (spec.values?.length || 0) }}项
                </el-tag>
                <span v-if="!row.specList || !row.specList.length" class="text-slate-400">多规格</span>
              </div>
            </template>
            <template v-else>
              <span class="text-slate-400">单规格</span>
            </template>
          </template>
        </el-table-column>
        <el-table-column label="属性" width="120">
          <template #default="{ row }">
            <template v-if="getProductAttrSummary(row).count">
              <el-tooltip :content="getProductAttrSummary(row).names.join('、')" placement="top">
                <el-tag effect="plain" round>{{ getProductAttrSummary(row).count }}项</el-tag>
              </el-tooltip>
            </template>
            <template v-else>—</template>
          </template>
        </el-table-column>
        <el-table-column prop="price" label="价格" width="110">
          <template #default="{ row }"><span class="font-mono text-slate-700">¥ {{ Number(row.price || 0).toFixed(2) }}</span></template>
        </el-table-column>
        <el-table-column prop="stock" label="库存" width="110">
           <template #default="{ row }">
             <el-tag :type="Number(row.stock) < Number(row.lowStockThreshold ?? 10) ? 'danger' : 'success'" round>{{ row.stock }}</el-tag>
           </template>
        </el-table-column>
        <el-table-column prop="lowStockThreshold" label="低库存预警" width="120" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-switch v-model="row.status" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" :icon="Edit" @click="handleEdit(row)">编辑</el-button>
            <el-button link type="danger" :icon="Delete" @click="handleDelete(row)">删除</el-button>
            <el-button link type="primary" @click="openProductDetail(row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="showDetailDialog" title="商品详情" width="720px">
      <div v-if="detailProduct" class="space-y-4">
        <div class="flex gap-4 items-start p-4 rounded border bg-slate-50">
          <el-image :src="detailProduct.image" class="w-16 h-16 rounded bg-slate-200" fit="cover" />
          <div class="flex-1">
            <div class="text-lg font-bold">{{ detailProduct.name }}</div>
            <div class="text-sm text-slate-600">{{ detailProduct.detail }}</div>
            <div class="mt-2 text-sm">
              <el-tag size="small" effect="plain">库存：{{ detailProduct.stock }}</el-tag>
              <el-tag size="small" effect="plain" class="ml-2">价格：¥ {{ Number(detailProduct.price || 0).toFixed(2) }}</el-tag>
            </div>
          </div>
        </div>
        <div v-if="(detailProduct.skus || []).length" class="overflow-x-auto">
          <el-table
            :data="detailProduct.skus || []"
            size="small"
            :fit="true"
            class="min-w-[680px]"
            :row-key="sku => sku.id ?? sku.__key"
          >
            <el-table-column
              v-for="(name, idx) in (detailProduct.specList?.map(s => s.name) || (detailProduct.skus?.[0]?.specs ? Object.keys(detailProduct.skus[0].specs) : []))"
              :key="name || ('spec-' + idx)"
              :label="name || ('规格' + (idx + 1))"
            >
              <template #default="scope">{{ scope.row.specs?.[name] }}</template>
            </el-table-column>
            <el-table-column label="价格" min-width="120">
              <template #default="scope">¥ {{ Number(scope.row.price || 0).toFixed(2) }}</template>
            </el-table-column>
            <el-table-column label="库存" min-width="100">
              <template #default="scope">{{ scope.row.stock ?? 0 }}</template>
            </el-table-column>
            <el-table-column label="预警阈值" min-width="110">
              <template #default="scope">{{ scope.row.lowStockThreshold ?? 10 }}</template>
            </el-table-column>
            <el-table-column label="属性" min-width="160">
              <template #default="scope">
                <template v-if="getAttrNames(getSkuAttrItems(scope.row)).length">
                  <el-tooltip :content="getAttrNames(getSkuAttrItems(scope.row)).join('、')" placement="top">
                    <span class="text-slate-600">{{ getAttrNames(getSkuAttrItems(scope.row)).join('、') }}</span>
                  </el-tooltip>
                </template>
                <template v-else>—</template>
              </template>
            </el-table-column>
            <el-table-column label="编码" min-width="140">
              <template #default="scope">{{ scope.row.code || scope.row.skuCode || '' }}</template>
            </el-table-column>
          </el-table>
        </div>
        <div v-else class="px-3 py-3 text-sm rounded border text-slate-400 bg-slate-50">暂无SKU</div>
      </div>
      <template #footer>
        <el-button @click="showDetailDialog = false">关闭</el-button>
      </template>
    </el-dialog>
    <el-dialog v-model="showEditDialog" :title="productForm.id ? '编辑商品' : '新增商品'" width="860px">
      <el-form label-width="80px" :model="productForm" :rules="productRules" ref="productFormRef">
        <el-form-item label="商品类型" prop="categoryId">
          <el-select v-model="productForm.categoryId" placeholder="请选择商品类型" class="w-full">
            <el-option v-for="cat in categories" :key="cat.id" :label="cat.name" :value="String(cat.id)" />
          </el-select>
        </el-form-item>
        <el-form-item label="商品名称" prop="name">
          <el-input v-model="productForm.name" placeholder="请输入商品名称" />
        </el-form-item>
        <el-form-item label="规格组合">
          <el-switch v-model="productForm.hasSkus" />
        </el-form-item>
        <el-form-item v-if="productForm.hasSkus" label="规格设置">
          <div class="w-full">
            <div class="flex gap-8 p-4 mb-4 text-sm bg-blue-50 rounded text-slate-600">
              <div>总库存 (自动计算): <span class="font-bold text-blue-600">{{ displayTotalStock }}</span></div>
              <div>最低价 (自动计算): <span class="font-bold text-blue-600">¥ {{ displayMinPrice.toFixed(2) }}</span></div>
            </div>

            <div v-for="(spec, index) in productForm.specs" :key="index" class="p-4 mb-4 rounded border bg-slate-50">
               <div class="flex justify-between items-center mb-2">
                 <el-input v-model="spec.name" placeholder="规格名 (e.g. 颜色)" class="w-40" />
                 <el-button type="danger" link @click="removeSpec(index)">删除</el-button>
               </div>
               <div class="flex flex-wrap gap-2 items-center">
                 <el-tag v-for="(val, vIndex) in spec.values" :key="vIndex" closable @close="removeSpecValue(index, vIndex)">{{ val }}</el-tag>
                 <div class="flex gap-1">
                   <el-input v-model="spec.tempValue" size="small" class="w-24" placeholder="输入值回车" @keyup.enter="addSpecValue(index)" />
                   <el-button size="small" @click="addSpecValue(index)">+</el-button>
                 </div>
               </div>
            </div>
            <el-button @click="addSpec" type="primary" plain size="small" class="mb-4">添加规格</el-button>
          </div>
        </el-form-item>

        <el-form-item label="SKU">
          <div class="overflow-x-auto w-full">
            <el-table
              :data="productForm.skus"
              border
              :fit="true"
              class="min-w-[760px]"
              size="small"
              :row-key="sku => sku.id ?? sku.__key"
              :key="`${productForm.hasSkus}:${(productForm.specs?.length || 0)}:${(productForm.skus?.length || 0)}`"
            >
              <el-table-column
                v-for="(spec, idx) in (productForm.hasSkus ? productForm.specs : [])"
                :key="spec.name || ('spec-' + idx)"
                :label="spec.name || '规格' + (idx + 1)"
              >
                <template #default="{ row }">{{ spec.name ? (row.specs?.[spec.name] ?? '') : '' }}</template>
              </el-table-column>
              <el-table-column label="价格" width="140">
                <template #default="{ row }"><el-input-number v-model="row.price" :min="0" :precision="2" size="small" class="w-full" /></template>
              </el-table-column>
              <el-table-column label="库存" width="140">
                <template #default="{ row }"><el-input-number v-model="row.stock" :min="0" :precision="0" size="small" class="w-full" /></template>
              </el-table-column>
              <el-table-column label="预警阈值" width="140">
                <template #default="{ row }"><el-input-number v-model="row.lowStockThreshold" :min="0" :precision="0" size="small" class="w-full" /></template>
              </el-table-column>
              <el-table-column label="编码" width="120">
                <template #default="{ row }"><el-input v-model="row.skuCode" size="small" placeholder="SKU编码" /></template>
              </el-table-column>
              <el-table-column label="属性配置" width="120">
                <template #default="{ $index }">
                  <el-button size="small" @click="openSkuAttrDialog($index)">配置</el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </el-form-item>
        <el-form-item label="商品详情">
          <el-input v-model="productForm.detail" type="textarea" placeholder="请输入商品详情" />
        </el-form-item>
        <el-form-item label="图片">
          <el-upload 
            v-model:file-list="uploadFileList"
            list-type="picture-card"
            :limit="1"
            accept="image/*"
            :before-upload="beforeUpload"
            :http-request="handleUploadRequest"
            :on-remove="handleRemoveImage"
            :on-preview="handlePreviewImage"
            :on-exceed="handleUploadExceed"
          >
            <template v-if="uploadFileList" >
              <el-icon  class="avatar-uploader-icon"><Plus/></el-icon>
            </template>
          </el-upload>
          <el-dialog v-model="showImagePreview" width="420px">
            <img :src="previewImageUrl" class="w-full" />
          </el-dialog>
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="productForm.status" active-text="上架" inactive-text="下架" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="saveProduct">保存</el-button>
          <el-button @click="showEditDialog = false">取消</el-button>
        </el-form-item>
      </el-form>
    </el-dialog>

    <el-dialog v-model="showSkuAttrDialog" title="SKU属性配置" width="760px">
      <div class="space-y-3">
        <div class="flex justify-between items-center">
          <div class="text-sm text-slate-600">为当前SKU设置可选属性（例如：温度、是否加柠檬）</div>
          <el-button type="primary" plain size="small" @click="addAttrItem">新增属性</el-button>
        </div>
        <div v-if="!skuAttrDraft || skuAttrDraft.length === 0" class="py-6 text-center rounded border text-slate-400">
          暂无属性
        </div>
        <div v-for="(item, i) in skuAttrDraft" :key="i" class="p-3 rounded border bg-slate-50">
          <div class="flex gap-2 items-center">
            <el-input v-model="item.name" placeholder="属性名（如：温度）" class="w-48" />
            <el-select v-model="item.type" class="w-28">
              <el-option label="单选" value="single" />
              <el-option label="多选" value="multi" />
            </el-select>
            <div class="flex gap-2 items-center">
              <span class="text-sm text-slate-600">必填</span>
              <el-switch v-model="item.required" />
            </div>
            <el-button type="danger" link @click="removeAttrItem(i)">删除</el-button>
          </div>
          <div class="mt-3">
            <div class="flex flex-wrap gap-2 items-center">
              <el-tag v-for="(opt, oi) in item.options" :key="`${i}_${oi}`" closable @close="removeAttrOption(i, oi)">{{ opt }}</el-tag>
              <div class="flex gap-1">
                <el-input v-model="item.tempOption" size="small" class="w-36" placeholder="新增选项回车" @keyup.enter="addAttrOption(i)" />
                <el-button size="small" @click="addAttrOption(i)">+</el-button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="showSkuAttrDialog = false">取消</el-button>
        <el-button type="primary" @click="applySkuAttrDialog">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showCategoryDialog" title="新增分类" width="380px">
      <el-form :model="addCategoryForm" label-width="80px">
        <el-form-item label="名称">
          <el-input v-model="addCategoryForm.name" placeholder="请输入分类名称" @keyup.enter="handleAddCategory" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="addCategoryForm.sort" :min="0" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="addCategoryForm.active" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleAddCategory">保存</el-button>
          <el-button @click="showCategoryDialog = false">取消</el-button>
        </el-form-item>
      </el-form>
    </el-dialog>
    
    <el-dialog v-model="showEditCategoryDialog" title="编辑分类" width="380px">
      <el-form :model="editCategoryForm" label-width="80px">
        <el-form-item label="名称">
          <el-input v-model="editCategoryForm.name" placeholder="请输入分类名称" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="editCategoryForm.sort" :min="0" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="editCategoryForm.active" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSaveCategory">保存</el-button>
          <el-button @click="showEditCategoryDialog = false">取消</el-button>
        </el-form-item>
      </el-form>
    </el-dialog>
  </div>
</template>
