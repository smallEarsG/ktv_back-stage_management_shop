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
const queryParams = reactive({
  page: 1,
  pageSize: 20,
  keyword: ''
})

const productForm = reactive({
  id: null,
  name: '',
  price: 0,
  stock: 0,
  categoryId: '',
  image: '',
  status: true,
  detail: '',
  lowStockThreshold: 10,
  hasSkus: false,
  stockType: 'independent', // 'independent' | 'shared'
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
  name: [{ required: true, message: '请输入商品名称', trigger: 'blur' }],
  price: [
    {
      validator: (rule, value, callback) => {
        const n = Number(value)
        if (Number.isNaN(n) || n < 0) {
          callback(new Error('请输入有效价格'))
        } else {
          callback()
        }
      },
      trigger: 'change'
    }
  ],
  stock: [
    {
      validator: (rule, value, callback) => {
        const n = Number(value)
        if (!Number.isInteger(n) || n < 0) {
          callback(new Error('请输入有效库存'))
        } else {
          callback()
        }
      },
      trigger: 'change'
    }
  ],
  lowStockThreshold: [
    {
      validator: (rule, value, callback) => {
        const n = Number(value)
        if (!Number.isInteger(n) || n < 0) {
          callback(new Error('请输入有效预警值'))
        } else {
          callback()
        }
      },
      trigger: 'change'
    }
  ]
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

const generateSkus = () => {
  const specs = productForm.specs.filter(s => s.name && s.values.length > 0)
  if (specs.length === 0) {
    productForm.skus = []
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
      specs: combo,
      price: existing?.price ?? productForm.price,
      stock: existing?.stock ?? 0,
      deduct: existing?.deduct ?? 1,
      skuCode: existing?.skuCode ?? existing?.code ?? ''
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
    products.value = res.list || []
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
  productForm.price = 0
  productForm.stock = 0
  productForm.categoryId = activeCategory.value
  productForm.image = ''
  productForm.status = true
  productForm.detail = ''
  productForm.hasSkus = false
  productForm.stockType = 'independent'
  productForm.specs = []
  productForm.skus = []
  uploadFileList.value = []
  showEditDialog.value = true
}

const handleEdit = (row) => {
  const p = { ...row }
  // Normalize SKUs: handle stringified specs and field variants
  if (p.skus && Array.isArray(p.skus)) {
    p.skus = p.skus.map(sku => {
      let specs = sku.specs || sku.sku_specs || sku.skuSpecs || {}
      if (typeof specs === 'string') {
        try {
          specs = JSON.parse(specs)
        } catch (e) {
          console.error('Failed to parse specs', e)
          specs = {}
        }
      }
      return {
        ...sku,
        specs
      }
    })
  }
  productForm.id = p.id ?? null
  productForm.name = p.name ?? ''
  productForm.categoryId = p.categoryId ?? activeCategory.value
  productForm.image = p.image ?? p.image_url ?? ''
  productForm.status = Boolean(p.status ?? true)
  productForm.detail = p.detail ?? ''
  productForm.lowStockThreshold = Number(p.lowStockThreshold ?? productForm.lowStockThreshold ?? 10)
  productForm.stockType = p.stockType ?? 'independent'
  const hasSkus = Boolean(p.hasSkus ?? ((Array.isArray(p.specList) && p.specList.length) || (Array.isArray(p.skus) && p.skus.length)))
  productForm.hasSkus = hasSkus
  if (!hasSkus) {
    productForm.price = Number(p.price) || 0
    productForm.stock = Number(p.stock) || 0
    productForm.specs = []
    productForm.skus = []
  } else {
    const names = Array.isArray(p.specList) && p.specList.length ? p.specList.map(s => s.name) : getSpecNames(p)
    const valuesMap = {}
    ;(p.skus || []).forEach(sku => {
      const specsObj = sku.specs ?? sku.sku_specs ?? sku.skuSpecs ?? {}
      names.forEach(n => {
        const v = specsObj?.[n]
        if (v !== undefined) {
          ;(valuesMap[n] = valuesMap[n] || []).push(v)
        }
      })
    })
    productForm.specs = names.map(n => ({
      name: n || '',
      values: Array.from(new Set(valuesMap[n] || [])),
      tempValue: ''
    }))
    productForm.skus = (p.skus || []).map(sku => ({
      id: sku.id ?? null,
      specs: sku.specs ?? sku.sku_specs ?? sku.skuSpecs ?? {},
      price: Number(sku.price) || 0,
      stock: Number(sku.stock ?? sku.stock_quantity ?? sku.stockQuantity) || 0,
      deduct: Number(sku.deduct ?? sku.stock_deduct_count ?? sku.stockDeductCount ?? 1) || 1,
      skuCode: sku.code ?? sku.sku_code ?? sku.skuCode ?? ''
    }))
    productForm.stock = Number(p.stock) || Number(productForm.stock) || 0
    productForm.price = Number(p.price) || (productForm.skus.length ? Math.min(...productForm.skus.map(s => Number(s.price) || 0)) : 0)
  }
  uploadFileList.value = (p.image || p.image_url) ? [{ name: p.name || 'image', url: p.image || p.image_url }] : []
  showEditDialog.value = true
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
    if (!productForm.id) {
      const valid = await productFormRef.value?.validate?.()
      if (!valid) return
    }
    
    // 多规格模式下，自动计算总库存和最低价格
    if (productForm.hasSkus && productForm.skus.length > 0) {
      if (productForm.stockType === 'independent') {
        productForm.stock = productForm.skus.reduce((sum, sku) => sum + (Number(sku.stock) || 0), 0)
      } 
      // 共享库存模式下，stock 以用户输入的 productForm.stock 为准，不需要覆盖
      
      const minPrice = Math.min(...productForm.skus.map(sku => Number(sku.price) || 0))
      productForm.price = minPrice === Infinity ? 0 : minPrice
    }
    if (productForm.stockType === 'shared') {  // 共享状态下移除skuCode
        productForm.skus.forEach(sku => {
          delete sku.skuCode 
        })
      }
    if (productForm.id) {
      await request.put(`/products/${productForm.id}`, productForm)
      ElMessage.success('更新成功')
    } else {
      await request.post('/products', productForm)
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
  if (!productForm.hasSkus) return productForm.stock
  if (productForm.stockType === 'shared') return productForm.stock
  return productForm.skus.reduce((sum, sku) => sum + (Number(sku.stock) || 0), 0)
})

const displayMinPrice = computed(() => {
  if (!productForm.hasSkus) return productForm.price
  if (!productForm.skus.length) return 0
  const min = Math.min(...productForm.skus.map(sku => Number(sku.price) || 0))
  return min === Infinity ? 0 : min
})

const estimateSharedSkuStock = (product, sku) => {
  const total = Number(product?.stock) || 0
  const deduct = Number(sku?.deduct ?? sku?.stockDeductCount ?? sku?.stock_deduct_count ?? 1) || 1
  return Math.floor(total / deduct)
}

const getSkuSellableStock = (product, sku) => {
  if (product?.stockType === 'shared') {
    return estimateSharedSkuStock(product, sku)
  }
  return Number(sku?.stock ?? sku?.stock_quantity ?? sku?.stockQuantity) || 0
}

const getRowClass = ({ row }) => {
  const threshold = Number(row.lowStockThreshold ?? 20)
  return Number(row.stock) < threshold ? 'bg-red-50' : ''
}

const getSpecNames = (product) => {
  const fromList = Array.isArray(product?.specList) ? product.specList.map(s => s.name) : []
  if (fromList.length) return fromList
  const firstSpecs = product?.skus?.[0]?.specs
  return firstSpecs ? Object.keys(firstSpecs) : []
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
        <el-table-column type="expand">
          <template #default="{ row }">
            <div v-if="row.hasSkus" class="p-3 rounded border bg-slate-50">
              <div class="mb-2 text-sm text-slate-600">
                <span>库存模式：</span>
                <span class="font-bold">{{ row.stockType === 'shared' ? '共享库存' : '独立库存' }}</span>
              </div>
              <el-table
                :data="row.skus || []"
                size="small"
                :fit="true"
                :row-key="sku => sku.skuCode || (sku.specs ? Object.values(sku.specs).join('-') : '')"
                :key="`${row.stockType || 'independent'}:${(row.specList?.length || 0)}:${(row.skus?.length || 0)}`"
                class="w-full"
              >
                <el-table-column
                  v-for="(name, idx) in (row.specList?.map(s => s.name) || (row.skus?.[0]?.specs ? Object.keys(row.skus[0].specs) : []))"
                  :key="name || ('spec-' + idx)"
                  :label="name || ('规格' + (idx + 1))"
                >
                  <template #default="scope">{{ scope.row.specs?.[name] }}</template>
                </el-table-column>
                <el-table-column label="价格" min-width="120">
                  <template #default="scope">¥ {{ Number(scope.row.price || 0).toFixed(2) }}</template>
                </el-table-column>
                <template v-if="row.stockType === 'independent'" :key="'independent'">
                  <el-table-column label="库存" min-width="100">
                    <template #default="scope">{{ scope.row.stock ?? 0 }}</template>
                  </el-table-column>
                  <el-table-column label="可售库存" min-width="120">
                    <template #default="scope">
                      <span class="text-slate-500">{{ getSkuSellableStock(row, scope.row) }}</span>
                    </template>
                  </el-table-column>
                </template>
                <template v-else :key="'shared'">
                  <el-table-column label="库存消耗" min-width="110">
                    <template #default="scope">{{ scope.row.deduct ?? 1 }}</template>
                  </el-table-column>
                  <el-table-column label="可售库存(估算)" min-width="140">
                    <template #default="scope">
                      <span class="text-slate-500">{{ getSkuSellableStock(row, scope.row) }}</span>
                    </template>
                  </el-table-column>
                </template>
                <el-table-column label="编码" min-width="140">
                  <template #default="scope">{{ scope.row.code || scope.row.skuCode || '' }}</template>
                </el-table-column>
              </el-table>
            </div>
            <div v-else class="px-3 py-3 text-sm rounded border text-slate-400 bg-slate-50">该商品为单规格，无SKU明细</div>
          </template>
        </el-table-column>
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
            <template v-if="row.hasSkus">
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
        <el-table-column prop="price" label="价格" width="110">
          <template #default="{ row }"><span class="font-mono text-slate-700">¥ {{ row.price.toFixed(2) }}</span></template>
        </el-table-column>
        <el-table-column prop="stock" label="库存" width="110">
           <template #default="{ row }">
             <el-tag :type="row.stock < (row.lowStockThreshold ?? 20) ? 'danger' : 'success'" round>{{ row.stock }}</el-tag>
           </template>
        </el-table-column>
        <el-table-column prop="lowStockThreshold" label="低库存预警" width="120" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-switch v-model="row.status" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" :icon="Edit" @click="handleEdit(row)">编辑</el-button>
            <el-button link type="danger" :icon="Delete" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="showEditDialog" :title="productForm.id ? '编辑商品' : '新增商品'" width="860px">
      <el-form label-width="80px" :model="productForm" :rules="productRules" ref="productFormRef">
        <el-form-item label="商品类型" prop="categoryId">
          <el-select v-model="productForm.categoryId" placeholder="请选择商品类型" class="w-full">
            <el-option v-for="cat in categories" :key="cat.id" :label="cat.name" :value="cat.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="商品名称" prop="name">
          <el-input v-model="productForm.name" placeholder="请输入商品名称" />
        </el-form-item>
        <el-form-item label="多规格">
          <el-switch v-model="productForm.hasSkus" />
        </el-form-item>
        
        <template v-if="!productForm.hasSkus">
          <el-form-item label="价格" prop="price">
            <el-input-number v-model="productForm.price" :min="0" :precision="2" />
          </el-form-item>
          <el-form-item label="库存" prop="stock">
            <el-input-number v-model="productForm.stock" :min="0" :precision="0" />
          </el-form-item>
        </template>

        <template v-else>
          <el-form-item label="库存模式">
            <el-radio-group v-model="productForm.stockType">
              <el-radio label="independent">独立库存 (各规格库存互不影响)</el-radio>
              <el-radio label="shared">共享库存 (扣减总库存，适用于套装/组合)</el-radio>
            </el-radio-group>
          </el-form-item>
          
          <el-form-item v-if="productForm.stockType === 'shared'" label="总库存" prop="stock">
            <el-input-number v-model="productForm.stock" :min="0" :precision="0" placeholder="物理总库存" />
            <span class="ml-2 text-xs text-slate-400">所有规格共享此库存</span>
          </el-form-item>

          <el-form-item label="规格设置">
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
              <div class="overflow-x-auto">
                <el-table
                  :data="productForm.skus"
                  border
                  :fit="true"
                  class="min-w-[760px]"
                  size="small"
                  :row-key="sku => sku.skuCode || sku.sku_code || sku.code || Object.values(sku.specs || {}).join('-')"
                  :key="`${productForm.stockType}:${(productForm.specs?.length || 0)}:${(productForm.skus?.length || 0)}`"
                >
                  <el-table-column
                  v-for="(spec, idx) in productForm.specs"
                  :key="spec.name || ('spec-' + idx)"
                  :label="spec.name || '规格' + (idx + 1)"
                >
                  <template #default="{ row }">{{ spec.name ? (row.specs?.[spec.name] ?? '') : '' }}</template>
                </el-table-column>
                <el-table-column label="价格" width="140">
                   <template #default="{ row }"><el-input-number v-model="row.price" :min="0" :precision="2" size="small" class="w-full" /></template>
                </el-table-column>
                
                <el-table-column v-if="productForm.stockType === 'independent'" label="库存" width="140">
                   <template #default="{ row }"><el-input-number v-model="row.stock" :min="0" :precision="0" size="small" class="w-full" /></template>
                </el-table-column>
                
                <template v-else>
                  <el-table-column label="库存消耗" width="140">
                     <template #default="{ row }">
                       <el-input-number v-model="row.deduct" :min="1" :precision="0" size="small" class="w-full" />
                     </template>
                  </el-table-column>
                  <el-table-column label="可售库存 (估算)" width="140">
                     <template #default="{ row }">
                       <span class="text-slate-500">{{ Math.floor(productForm.stock / (row.deduct || 1)) }}</span>
                     </template>
                  </el-table-column>
                </template>

                <el-table-column label="编码" width="120">
                   <template #default="{ row }"><el-input v-model="row.skuCode" size="small" placeholder="SKU编码" /></template>
                </el-table-column>
              </el-table>
              </div>
            </div>
          </el-form-item>
        </template>
        <el-form-item label="低库存预警" prop="lowStockThreshold">
          <el-input-number v-model="productForm.lowStockThreshold" :min="0" :precision="0" />
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
