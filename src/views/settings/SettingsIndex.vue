<script setup>
import { ref, onMounted, onBeforeUnmount, reactive, watch, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '@/lib/request'
import { authStorage } from '@/lib/auth-storage'
import { useUserStore } from '@/stores/user'
import QRCode from 'qrcode'
import ResetStaffPassword from '@/components/ResetStaffPassword.vue'
import MerchantAudit from '@/components/MerchantAudit.vue'
import StaffPermissionEditor from '@/components/StaffPermissionEditor.vue'
import { isV2Permissions } from '@/lib/permissions'

const activeTab = ref('store')
const userStore = useUserStore()
const diningAvailable = computed(() => userStore.canAccessProduct('DINING'))
const isAdmin = computed(() => userStore.userInfo?.role === 'admin')
const fineGrained = computed(() => isV2Permissions(userStore.permissions || userStore.userInfo?.permissions || []))
const canEditStore = computed(() => !fineGrained.value || isAdmin.value)
const canReadRooms = computed(() => diningAvailable.value && (!fineGrained.value || userStore.hasPermission(['settings:view', 'pos:view', 'workbench:view'], 'DINING')))
const canEditRooms = computed(() => diningAvailable.value && (!fineGrained.value || userStore.hasPermission('settings:edit', 'DINING')))
const canReadDiningSettings = computed(() => diningAvailable.value && (!fineGrained.value || userStore.hasPermission('settings:view', 'DINING')))
const canReadSeats = computed(() => diningAvailable.value && (!fineGrained.value || userStore.hasPermission('dining:view', 'DINING')))
const resetStaff = ref(null)
const storeLoading = ref(false)
const storeSaving = ref(false)
const storeProfile = reactive({ storeName: '', contactPhone: '', businessHours: '', address: '' })
const loadStore = async () => {
  storeLoading.value = true
  try {
    const data = await request.get('/store/config')
    for (const key of Object.keys(storeProfile)) storeProfile[key] = String(data[key] || '')
  } finally { storeLoading.value = false }
}
const saveStore = async () => {
  if (storeSaving.value || !canEditStore.value) return
  if (!storeProfile.storeName.trim() || !storeProfile.contactPhone.trim()) { ElMessage.warning('请填写门店名称和联系电话'); return }
  storeSaving.value = true
  try {
    await request.put('/store/config/profile', { ...storeProfile })
    ElMessage.success('门店资料已保存'); await loadStore()
  } finally { storeSaving.value = false }
}
const qrVisible = ref(false)
const qrImage = ref('')
const qrTarget = ref('')
const qrRoom = ref('')

const roomLoading = ref(false)
const roomList = ref([])
const roomQuery = reactive({
  type: '',
  keyword: ''
})
const roomDialogVisible = ref(false)
const roomDetailLoading = ref(false), roomSaving = ref(false), roomReady = ref(false), roomError = ref(''), roomEditId = ref(null)
let roomGeneration = 0, roomDisposed = false
watch(roomDialogVisible, visible => {
  if (!visible) { roomGeneration++; roomReady.value = false; roomDetailLoading.value = false; roomSaving.value = false }
}, { flush: 'sync' })
onBeforeUnmount(() => { roomDisposed = true; roomGeneration++ })
const roomFormRef = ref(null)
const roomForm = reactive({
  id: null,
  roomNumber: '',
  type: '',
  capacity: 0,
  qrCodeUrl: '',
  isAvailable: true
})
const roomRules = {
  roomNumber: [{ required: true, message: '请输入房间号', trigger: 'blur' }],
  type: [{ required: true, message: '请选择类型', trigger: 'change' }],
  capacity: [{ required: true, message: '请输入容纳人数', trigger: 'blur' }]
}

const roomTypes = ['餐桌', '餐馆包间', '吧台', '小包', '中包', '大包', '散座']

// Staff Management Logic
const staffList = ref([])
const staffLoading = ref(false)
const staffQuery = reactive({
  page: 1,
  size: 10,
  username: '',
  phone: ''
})
const staffTotal = ref(0)
const staffDialogVisible = ref(false)
const staffFormRef = ref(null)
const staffForm = reactive({
  username: '',
  password: '',
  name: '', // Maps to nickname in API
  role: 'staff',
  phone: ''
})
const staffRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, min: 8, message: '密码至少8位', trigger: 'blur' }],
  name: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  phone: [{ required: true, message: '请输入手机号', trigger: 'blur' }]
}

const handleAddStaff = () => {
  staffDialogVisible.value = true
  // Reset form
  staffForm.username = ''
  staffForm.password = ''
  staffForm.name = ''
  staffForm.role = 'staff'
  staffForm.phone = ''
}

const submitStaff = async () => {
  if (!staffFormRef.value) return
  await staffFormRef.value.validate(async (valid) => {
    if (valid) {
      try {
        const userInfo = authStorage.getItem('userInfo') ? JSON.parse(authStorage.getItem('userInfo')) : {}
        const storeId = userInfo.storeId || 0
        
        await request.post('/auth/register', {
          username: staffForm.username,
          password: staffForm.password,
          nickname: staffForm.name,
          role: staffForm.role,
          phone: staffForm.phone,
          storeId: storeId // Add storeId from current user context
        })
        ElMessage.success('添加成功')
        staffDialogVisible.value = false
        getStaffList()
      } catch (error) {
        // Error handled
      }
    }
  })
}

const getStaffList = async () => {
  staffLoading.value = true
  try {
    const res = await request.get('/users', {
      params: {
        page: staffQuery.page,
        size: staffQuery.size,
        username: staffQuery.username || undefined,
        phone: staffQuery.phone || undefined
      }
    })
    const data = res?.data ?? res ?? {}
    staffList.value = data?.records || data?.list || data?.rows || []
    staffTotal.value = Number(data?.total ?? res?.total ?? 0) || 0
  } catch (error) {
    console.error(error)
  } finally {
    staffLoading.value = false
  }
}

const editProfileDialogVisible = ref(false)
const editProfileFormRef = ref(null)
const editProfileForm = reactive({
  id: '',
  nickname: '',
  phone: '',
  isActive: true
})
const editProfileRules = {
  nickname: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  phone: [{ required: true, message: '请输入手机号', trigger: 'blur' }]
}

const handleEditProfile = (row) => {
  const currentUser = authStorage.getItem('userInfo') ? JSON.parse(authStorage.getItem('userInfo')) : {}
  // Check if target is admin and current user is not admin
  if (row.role === 'admin' && currentUser.role !== 'admin') {
    ElMessage.warning('只有店长可以编辑店长信息')
    return
  }
  
  editProfileForm.id = row.id
  editProfileForm.nickname = row.name
  editProfileForm.phone = row.phone
  editProfileForm.isActive = (row.isActive ?? row.is_active) !== 0 && (row.isActive ?? row.is_active) !== false // Handle DB variations
  
  editProfileDialogVisible.value = true
}

const submitEditProfile = async () => {
  if (!editProfileFormRef.value) return
  await editProfileFormRef.value.validate(async (valid) => {
    if (valid) {
      try {
        await request.put(`/users/${editProfileForm.id}`, {
          nickname: editProfileForm.nickname,
          phone: editProfileForm.phone,
          isActive: editProfileForm.isActive
        })
        ElMessage.success('更新成功')
        editProfileDialogVisible.value = false
        getStaffList()
      } catch (error) {
        // Error handled
      }
    }
  })
}

const permissionDialogVisible = ref(false)
const permissionSaving = ref(false)
const permissionEditorRef = ref(null)
const permissionStaff = ref(null)
const assignableBusinesses = computed(() => ['DINING', 'MALL'].filter(userStore.canAccessProduct))

const handlePermissionSet = (row) => {
  const currentUser = authStorage.getItem('userInfo') ? JSON.parse(authStorage.getItem('userInfo')) : {}
  if (currentUser.role !== 'admin') {
     ElMessage.warning('只有店长可以设置权限')
     return
  }

  if (row.role === 'admin') {
    ElMessage.warning('店长拥有全部权限，无需设置')
    return
  }

  permissionStaff.value = { ...row, permissions: [...(row.permissions || [])] }
  permissionDialogVisible.value = true
}

const closePermissionDialog = async (done) => {
  if (permissionSaving.value) return
  if (!permissionEditorRef.value || await permissionEditorRef.value.confirmDiscard()) done()
}

const submitPermission = async (permissions) => {
  if (permissionSaving.value || !isAdmin.value || !permissionStaff.value || permissionStaff.value.role === 'admin') return
  permissionSaving.value = true
  try {
    await request.put(`/users/${permissionStaff.value.id}/role`, {
      role: 'staff',
      permissions
    })
    ElMessage.success('权限更新成功')
    permissionDialogVisible.value = false
    getStaffList()
  } catch (error) {
    // Error handled
  } finally { permissionSaving.value = false }
}

const handleDeleteStaff = (row) => {
  if (row.role === 'admin') {
    ElMessage.warning('店长账号不可删除')
    return
  }

  ElMessageBox.confirm(
    `确定要删除员工 "${row.name || row.username}" 吗?`,
    '警告',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    }
  )
    .then(async () => {
      try {
        await request.delete(`/users/${row.id}`)
        ElMessage.success('删除成功')
        getStaffList()
      } catch (error) {
        // Error handled by interceptor
      }
    })
    .catch(() => {
      // Cancelled
    })
}

const handleStaffPageChange = (page) => {
  staffQuery.page = page
  getStaffList()
}

const getRoomList = async () => {
  if (!canReadRooms.value) return
  roomLoading.value = true
  try {
    const res = await request.get('/rooms', {
      params: {
        type: roomQuery.type || undefined
      }
    })
    const list = res?.list || []
    const kw = String(roomQuery.keyword || '').trim().toLowerCase()
    roomList.value = kw
      ? list.filter(r => String(r?.roomNumber || '').toLowerCase().includes(kw))
      : list
  } catch (error) {
    console.error(error)
  } finally {
    roomLoading.value = false
  }
}

const resetRoomForm = () => {
  roomForm.id = null
  roomForm.roomNumber = ''
  roomForm.type = ''
  roomForm.capacity = 0
  roomForm.qrCodeUrl = ''
  roomForm.isAvailable = true
}

const handleAddRoom = () => {
  if (roomDisposed || !canEditRooms.value) return
  roomGeneration++; roomEditId.value = null; roomDetailLoading.value = false; roomSaving.value = false; roomError.value = ''
  resetRoomForm()
  roomReady.value = true
  roomDialogVisible.value = true
}

const handleEditRoom = async (row) => {
  if (roomDisposed || !canEditRooms.value) return
  const generation = ++roomGeneration, target = row.id
  const current = () => !roomDisposed && generation === roomGeneration && roomDialogVisible.value && roomEditId.value === target
  roomEditId.value = target; roomDetailLoading.value = true; roomSaving.value = false; roomReady.value = false; roomError.value = ''
  resetRoomForm()
  roomForm.id = target
  roomDialogVisible.value = true
  try {
    const res = await request.get(`/rooms/${target}`)
    if (!current()) return
    if (!res?.id || String(res.id) !== String(target)) throw new Error('房间资料与当前选择不一致，请重新打开')
    roomForm.id = target
    roomForm.roomNumber = res?.roomNumber ?? row.roomNumber ?? ''
    roomForm.type = res?.type ?? row.type ?? ''
    roomForm.capacity = Number(res?.capacity ?? row.capacity ?? 0) || 0
    roomForm.qrCodeUrl = res?.qrCodeUrl ?? row.qrCodeUrl ?? ''
    roomForm.isAvailable = res?.isAvailable !== false
    roomReady.value = true
  } catch (error) {
    if (current()) roomError.value = error.message || '房间详情加载失败，请关闭后重新打开'
  } finally { if (current()) roomDetailLoading.value = false }
}

const submitRoom = async () => {
  if (!canEditRooms.value || !roomFormRef.value || !roomDialogVisible.value || !roomReady.value || roomDetailLoading.value || roomSaving.value) return
  const generation = roomGeneration, target = roomEditId.value
  const current = () => !roomDisposed && generation === roomGeneration && roomDialogVisible.value && roomEditId.value === target
  roomSaving.value = true
  try {
    let valid
    try { valid = await roomFormRef.value.validate() } catch { return }
    if (!valid || !current() || !roomReady.value || !canEditRooms.value) return
    const body = {
      roomNumber: roomForm.roomNumber,
      type: roomForm.type,
      capacity: Number(roomForm.capacity),
      qrCodeUrl: roomForm.qrCodeUrl || undefined,
      isAvailable: roomForm.isAvailable
    }
    if (target) {
      await request.put(`/rooms/${target}`, body)
    } else {
      await request.post('/rooms', body)
    }
    if (!current()) return
    ElMessage.success(target ? '更新成功' : '添加成功')
    roomDialogVisible.value = false
    getRoomList()
  } catch (error) {
    if (current()) roomError.value = error.message || '保存失败，请核对后重试'
  } finally { if (current()) roomSaving.value = false }
}

const handleDeleteRoom = (row) => {
  if (!canEditRooms.value) return
  ElMessageBox.confirm(`确定要删除房间 "${row.roomNumber}" 吗?`, '警告', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  })
    .then(async () => {
      try {
        if (!canEditRooms.value) return
        await request.delete(`/rooms/${row.id}`)
        ElMessage.success('删除成功')
        getRoomList()
      } catch (error) {
        console.error(error)
      }
    })
    .catch(() => {})
}

const downloadQr = async (row) => {
  if (!canReadRooms.value) return
  const demo = import.meta.env.VITE_DEMO_MODE === 'true'
  if (demo) {
    qrTarget.value = `${location.origin}/demo/customer/?storeCode=${encodeURIComponent(userStore.currentStoreId)}&roomId=${encodeURIComponent(row.roomNumber)}`
    qrImage.value = await QRCode.toDataURL(qrTarget.value, { width: 360, margin: 2, errorCorrectionLevel: 'M' })
  } else {
    const capabilities = await request.get('/payment/capabilities')
    if (capabilities.miniappCodes) {
      const code = await request.get(`/rooms/${row.id}/miniapp-code`)
      qrImage.value = code.image; qrTarget.value = '正式小程序扫码点单入口'
    } else {
      const target = row.qrCodeUrl
      if (!target || !/^https?:\/\//.test(target) || target.includes('ktv.example.com')) { ElMessage.warning('正式小程序尚未发布或启用。可在房间编辑中填写已开通的网页点单入口。'); return }
      qrTarget.value = target; qrImage.value = await QRCode.toDataURL(target, { width: 360, margin: 2, errorCorrectionLevel: 'M' })
    }
  }
  qrRoom.value = row.roomNumber
  qrVisible.value = true
}

// Initial Load
onMounted(() => {
  loadStore()
  // Only load staff if tab is active (or load on tab switch, but simple here)
  if (activeTab.value === 'staff') {
    getStaffList()
  }
  if (activeTab.value === 'rooms') {
    getRoomList()
  }
})

// Watch tab change to load data
watch(activeTab, (val) => {
  if (val === 'staff') {
    getStaffList()
  }
  if (val === 'rooms') {
    getRoomList()
  }
})
</script>

<template>
  <el-card>
    <ResetStaffPassword :staff="resetStaff" @close="resetStaff = null" />
    <el-dialog v-model="qrVisible" :title="`${qrRoom} 点单二维码`" width="440px">
      <img :src="qrImage" alt="点单二维码" class="mx-auto" />
      <p class="text-xs break-all text-slate-500">{{ qrTarget }}</p>
      <template #footer><a :href="qrImage" :download="`${qrRoom}-点单二维码.png`"><el-button type="primary">下载二维码</el-button></a></template>
    </el-dialog>
    <el-tabs v-model="activeTab">
      <el-tab-pane v-if="isAdmin" label="操作记录" name="audit"><MerchantAudit v-if="activeTab === 'audit'" /></el-tab-pane>
      <el-tab-pane v-if="canReadDiningSettings || canReadSeats" label="点餐场景" name="dining"><div class="p-6"><h2 class="text-xl mb-3">餐馆、KTV 与其他门店点餐</h2><p class="text-slate-500 mb-5">设置先付或后付、多人点餐、后厨出餐，以及实际接单的营业时间。</p><el-button v-if="canReadDiningSettings" type="primary" @click="$router.push('/dining/settings')">设置点餐场景</el-button><el-button v-if="canReadSeats" @click="$router.push('/dining/seats')">进入台位营业</el-button></div></el-tab-pane>
      <el-tab-pane label="门店资料" name="store">
        <el-form :disabled="!canEditStore" v-loading="storeLoading" label-width="120px" class="mt-4 max-w-lg">
          <el-form-item label="门店名称">
            <el-input v-model="storeProfile.storeName" maxlength="100" />
          </el-form-item>
          <el-form-item label="联系电话">
            <el-input v-model="storeProfile.contactPhone" maxlength="30" />
          </el-form-item>
          <el-form-item label="营业时间">
            <el-input v-model="storeProfile.businessHours" placeholder="例如 10:00—次日02:00" maxlength="100" />
          </el-form-item>
          <el-form-item label="门店地址">
            <el-input type="textarea" v-model="storeProfile.address" maxlength="500" />
          </el-form-item>
          <el-form-item>
            <el-button v-if="canEditStore" type="primary" :loading="storeSaving" @click="saveStore">保存更改</el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>
      
      <el-tab-pane v-if="canReadRooms" label="房间/座位管理" name="rooms">
        <div class="flex flex-wrap gap-2 items-center justify-between mb-4">
          <div class="flex flex-wrap gap-2 items-center">
            <el-select v-model="roomQuery.type" placeholder="类型" clearable class="w-32" @change="getRoomList">
              <el-option v-for="t in roomTypes" :key="t" :label="t" :value="t" />
            </el-select>
            <el-input v-model="roomQuery.keyword" placeholder="搜索房间号" clearable class="w-44" @clear="getRoomList" />
            <el-button type="primary" @click="getRoomList">查询</el-button>
          </div>
          <div class="flex gap-2">
            <el-button v-if="canEditRooms" type="primary" @click="handleAddRoom">添加房间</el-button>
            <el-button @click="getRoomList">刷新</el-button>
          </div>
        </div>

        <el-table :data="roomList" border v-loading="roomLoading">
          <el-table-column prop="roomNumber" label="房间号" width="140" />
          <el-table-column prop="type" label="类型" width="120" />
          <el-table-column prop="capacity" label="容纳人数" width="120" align="right" />
          <el-table-column label="可用" width="100" align="center">
            <template #default="{ row }">
              <el-tag :type="row.isAvailable === false ? 'info' : 'success'" effect="plain">
                {{ row.isAvailable === false ? '不可用' : '可用' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="220">
            <template #default="{ row }">
              <el-button link type="primary" @click="downloadQr(row).catch(() => {})">二维码</el-button>
              <el-button v-if="canEditRooms" link type="primary" @click="handleEditRoom(row)">编辑</el-button>
              <el-button v-if="canEditRooms" link type="danger" @click="handleDeleteRoom(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>

        <el-dialog v-model="roomDialogVisible" :title="roomEditId ? '编辑房间' : '添加房间'" width="520px">
          <el-alert v-if="roomError" :title="roomError" type="error" :closable="false" class="mb-4" />
          <el-form v-loading="roomDetailLoading" :disabled="!roomReady || roomDetailLoading || roomSaving" :model="roomForm" :rules="roomRules" ref="roomFormRef" label-width="90px">
            <el-form-item label="房间号" prop="roomNumber">
              <el-input v-model="roomForm.roomNumber" placeholder="例如 A01" />
            </el-form-item>
            <el-form-item label="类型" prop="type">
              <el-select v-model="roomForm.type" placeholder="请选择类型" class="w-full">
                <el-option v-for="t in roomTypes" :key="t" :label="t" :value="t" />
              </el-select>
            </el-form-item>
            <el-form-item label="容纳人数" prop="capacity">
              <el-input-number v-model="roomForm.capacity" :min="1" class="w-full" />
            </el-form-item>
            <el-form-item label="二维码地址">
              <el-input v-model="roomForm.qrCodeUrl" placeholder="https://..." />
            </el-form-item>
            <el-form-item label="可用">
              <el-switch v-model="roomForm.isAvailable" active-text="可用" inactive-text="不可用" />
            </el-form-item>
          </el-form>
          <template #footer>
            <span class="dialog-footer">
              <el-button @click="roomDialogVisible = false">取消</el-button>
              <el-button type="primary" :loading="roomSaving" :disabled="!canEditRooms || !roomReady || roomDetailLoading" @click="submitRoom">确定</el-button>
            </span>
          </template>
        </el-dialog>
      </el-tab-pane>
      
      <el-tab-pane v-if="canReadDiningSettings" label="点餐支付说明" name="payment">
        <el-alert title="微信收款退款接口已预留，真实商户资料须在服务器配置并启用。此页面不保存支付密钥。" type="warning" show-icon class="mb-4" />
        <el-form disabled label-width="120px" class="max-w-lg">
          <el-form-item label="商户号 (MCHID)">
            <el-input placeholder="请输入微信支付商户号" />
          </el-form-item>
          <el-form-item label="API密钥">
            <el-input placeholder="请输入API密钥" type="password" show-password />
          </el-form-item>
          <el-form-item>
            <el-button type="primary">校验配置并保存</el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>
      
      <el-tab-pane label="员工管理" name="staff">
        <div class="flex justify-between mb-4">
          <div class="flex gap-2">
             <el-input v-model="staffQuery.username" placeholder="用户名" class="w-40" clearable @clear="getStaffList" />
             <el-input v-model="staffQuery.phone" placeholder="手机号" class="w-40" clearable @clear="getStaffList" />
             <el-button type="primary" @click="getStaffList">查询</el-button>
          </div>
          <el-button type="primary" v-if="isAdmin" @click="handleAddStaff">添加员工</el-button>
        </div>
        <el-table :data="staffList" border v-loading="staffLoading">
          <el-table-column prop="username" label="用户名">
            <template #default="{ row }">
              <el-button link type="primary" @click="isAdmin && handleEditProfile(row)">{{ row.username }}</el-button>
            </template>
          </el-table-column>
          <el-table-column prop="name" label="姓名" />
          <el-table-column prop="role" label="角色">
            <template #default="{ row }">
               <el-tag :type="row.role === 'admin' ? 'danger' : 'info'">{{ row.role === 'admin' ? '店长／老板' : '员工' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="phone" label="手机号" />
          <el-table-column label="操作">
            <template #default="{ row }">
              <el-button link type="primary" v-if="isAdmin" @click="handlePermissionSet(row)" :disabled="row.role === 'admin'">权限设置</el-button>
              <el-button link type="danger" v-if="isAdmin" @click="handleDeleteStaff(row)" :disabled="row.role === 'admin'">删除</el-button>
              <el-button v-if="isAdmin && row.role !== 'admin'" link type="warning" @click="resetStaff = row">重置密码</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="flex justify-end mt-4">
           <el-pagination 
             background 
             layout="prev, pager, next" 
             :total="staffTotal" 
             :page-size="staffQuery.size"
             :current-page="staffQuery.page"
             @current-change="handleStaffPageChange"
           />
        </div>

        <!-- Add Staff Dialog -->
        <el-dialog v-model="staffDialogVisible" title="添加员工" width="500px">
          <el-form :model="staffForm" :rules="staffRules" ref="staffFormRef" label-width="80px">
            <el-form-item label="用户名" prop="username">
              <el-input v-model="staffForm.username" placeholder="登录账号" />
            </el-form-item>
            <el-form-item label="密码" prop="password">
              <el-input v-model="staffForm.password" type="password" show-password placeholder="登录密码" />
            </el-form-item>
            <el-form-item label="姓名" prop="name">
              <el-input v-model="staffForm.name" placeholder="员工姓名" />
            </el-form-item>
            <el-form-item label="手机号" prop="phone">
              <el-input v-model="staffForm.phone" placeholder="联系方式" />
            </el-form-item>
            <el-form-item label="角色" prop="role">
              <el-radio-group v-model="staffForm.role">
                <el-radio label="staff">员工</el-radio>

              </el-radio-group>
            </el-form-item>
          </el-form>
          <template #footer>
            <span class="dialog-footer">
              <el-button @click="staffDialogVisible = false">取消</el-button>
              <el-button type="primary" @click="submitStaff">确定</el-button>
            </span>
          </template>
        </el-dialog>

        <!-- Edit Profile Dialog -->
        <el-dialog v-model="editProfileDialogVisible" title="编辑员工信息" width="500px">
          <el-form :model="editProfileForm" :rules="editProfileRules" ref="editProfileFormRef" label-width="80px">
            <el-form-item label="姓名" prop="nickname">
              <el-input v-model="editProfileForm.nickname" placeholder="员工姓名" />
            </el-form-item>
            <el-form-item label="手机号" prop="phone">
              <el-input v-model="editProfileForm.phone" placeholder="联系方式" />
            </el-form-item>
            <el-form-item label="状态" prop="isActive">
              <el-switch v-model="editProfileForm.isActive" active-text="启用" inactive-text="禁用" />
            </el-form-item>
          </el-form>
          <template #footer>
            <span class="dialog-footer">
              <el-button @click="editProfileDialogVisible = false">取消</el-button>
              <el-button type="primary" @click="submitEditProfile">保存</el-button>
            </span>
          </template>
        </el-dialog>

        <!-- Permission Dialog -->
        <el-dialog v-model="permissionDialogVisible" title="员工业务与操作权限" width="min(1060px, 96vw)" :close-on-click-modal="false" :close-on-press-escape="!permissionSaving" :show-close="!permissionSaving" :before-close="closePermissionDialog" destroy-on-close>
          <StaffPermissionEditor v-if="permissionDialogVisible && permissionStaff" ref="permissionEditorRef" :staff="permissionStaff" :available-businesses="assignableBusinesses" :saving="permissionSaving" @save="submitPermission" @close="permissionDialogVisible = false" />
        </el-dialog>
      </el-tab-pane>
    </el-tabs>
  </el-card>
</template>
