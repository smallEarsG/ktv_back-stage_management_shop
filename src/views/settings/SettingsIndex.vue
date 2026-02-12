<script setup>
import { ref, onMounted, reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '@/lib/request'

const activeTab = ref('store')

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
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
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
        const userInfo = localStorage.getItem('userInfo') ? JSON.parse(localStorage.getItem('userInfo')) : {}
        const storeId = userInfo.storeId || 0
        
        const res = await request.post('/auth/register', {
          username: staffForm.username,
          password: staffForm.password,
          nickname: staffForm.name,
          role: staffForm.role,
          phone: staffForm.phone,
          storeId: storeId // Add storeId from current user context
        })
        if (res.code === 200) {
          ElMessage.success('添加成功')
          staffDialogVisible.value = false
          getStaffList()
        }
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
    if (res.code === 200) {
      staffList.value = res.data.records
      staffTotal.value = res.data.total
    }
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
  const currentUser = localStorage.getItem('userInfo') ? JSON.parse(localStorage.getItem('userInfo')) : {}
  // Check if target is admin and current user is not admin
  if (row.role === 'admin' && currentUser.role !== 'admin') {
    ElMessage.warning('只有店长可以编辑店长信息')
    return
  }
  
  editProfileForm.id = row.id
  editProfileForm.nickname = row.name
  editProfileForm.phone = row.phone
  editProfileForm.isActive = row.is_active !== 0 && row.is_active !== false // Handle DB variations
  
  editProfileDialogVisible.value = true
}

const submitEditProfile = async () => {
  if (!editProfileFormRef.value) return
  await editProfileFormRef.value.validate(async (valid) => {
    if (valid) {
      try {
        const res = await request.put(`/users/${editProfileForm.id}`, {
          nickname: editProfileForm.nickname,
          phone: editProfileForm.phone,
          isActive: editProfileForm.isActive
        })
        if (res.code === 200) {
          ElMessage.success('更新成功')
          editProfileDialogVisible.value = false
          getStaffList()
        }
      } catch (error) {
        // Error handled
      }
    }
  })
}

const permissionDialogVisible = ref(false)
const permissionForm = reactive({
  id: '',
  role: 'staff',
  permissions: []
})
const availablePermissions = [
  { label: '查看看板', value: 'dashboard:view' },
  { label: '订单管理', value: 'order:view' },
  { label: '商品管理', value: 'product:view' },
  { label: '退款管理', value: 'refund:view' },
  { label: '财务管理', value: 'finance:view' },
  { label: '仓库管理', value: 'warehouse:view' },
  { label: '门店设置', value: 'settings:view' }
]

const handlePermissionSet = (row) => {
  const currentUser = localStorage.getItem('userInfo') ? JSON.parse(localStorage.getItem('userInfo')) : {}
  if (currentUser.role !== 'admin') {
     ElMessage.warning('只有店长可以设置权限')
     return
  }

  if (row.role === 'admin') {
    ElMessage.warning('店长拥有全部权限，无需设置')
    return
  }

  permissionForm.id = row.id
  permissionForm.role = row.role
  permissionForm.permissions = row.permissions || [] // Assuming API returns permissions array
  permissionDialogVisible.value = true
}

const submitPermission = async () => {
  try {
    const res = await request.put(`/users/${permissionForm.id}/role`, {
      role: permissionForm.role,
      permissions: permissionForm.permissions
    })
    if (res.code === 200) {
      ElMessage.success('权限更新成功')
      permissionDialogVisible.value = false
      getStaffList()
    }
  } catch (error) {
    // Error handled
  }
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
        const res = await request.delete(`/users/${row.id}`)
        if (res.code === 200) {
          ElMessage.success('删除成功')
          getStaffList() // Refresh list
        }
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

// Initial Load
onMounted(() => {
  // Only load staff if tab is active (or load on tab switch, but simple here)
  if (activeTab.value === 'staff') {
    getStaffList()
  }
})

// Watch tab change to load data
import { watch } from 'vue'
watch(activeTab, (val) => {
  if (val === 'staff') {
    getStaffList()
  }
})
</script>

<template>
  <el-card>
    <el-tabs v-model="activeTab">
      <el-tab-pane label="门店资料" name="store">
        <el-form label-width="120px" class="mt-4 max-w-lg">
          <el-form-item label="门店名称">
            <el-input model-value="欢乐KTV旗舰店" />
          </el-form-item>
          <el-form-item label="联系电话">
            <el-input model-value="0755-12345678" />
          </el-form-item>
          <el-form-item label="营业时间">
            <el-time-picker is-range range-separator="至" start-placeholder="开始时间" end-placeholder="结束时间" />
          </el-form-item>
          <el-form-item label="门店地址">
            <el-input type="textarea" model-value="深圳市南山区科技园..." />
          </el-form-item>
          <el-form-item>
            <el-button type="primary">保存更改</el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>
      
      <el-tab-pane label="房间/座位管理" name="rooms">
        <div class="mb-4">
          <el-button type="primary">添加房间</el-button>
          <el-button type="success">批量生成二维码</el-button>
        </div>
        <el-table :data="[{name: 'A01', type: '小包', capacity: 4}, {name: 'B01', type: '中包', capacity: 8}]" border>
          <el-table-column prop="name" label="房间号" />
          <el-table-column prop="type" label="类型" />
          <el-table-column prop="capacity" label="容纳人数" />
          <el-table-column label="操作">
            <template #default>
              <el-button link type="primary">下载二维码</el-button>
              <el-button link type="primary">编辑</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
      
      <el-tab-pane label="支付配置" name="payment">
        <el-alert title="请配置微信商户号以启用支付功能" type="warning" show-icon class="mb-4" />
        <el-form label-width="120px" class="max-w-lg">
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
          <el-button type="primary" @click="handleAddStaff">添加员工</el-button>
        </div>
        <el-table :data="staffList" border v-loading="staffLoading">
          <el-table-column prop="username" label="用户名">
            <template #default="{ row }">
              <el-button link type="primary" @click="handleEditProfile(row)">{{ row.username }}</el-button>
            </template>
          </el-table-column>
          <el-table-column prop="name" label="姓名" />
          <el-table-column prop="role" label="角色">
            <template #default="{ row }">
               <el-tag :type="row.role === 'admin' ? 'danger' : 'info'">{{ row.role }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="phone" label="手机号" />
          <el-table-column label="操作">
            <template #default="{ row }">
              <el-button link type="primary" @click="handlePermissionSet(row)" :disabled="row.role === 'admin'">权限设置</el-button>
              <el-button link type="danger" @click="handleDeleteStaff(row)" :disabled="row.role === 'admin'">删除</el-button>
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
                <el-radio label="admin">店长</el-radio>
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
        <el-dialog v-model="permissionDialogVisible" title="权限设置" width="600px">
          <el-form label-width="80px">
            <el-form-item label="角色">
              <el-radio-group v-model="permissionForm.role">
                <el-radio label="staff">员工</el-radio>
                <el-radio label="admin">店长</el-radio>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="功能权限">
              <el-checkbox-group v-model="permissionForm.permissions">
                <el-checkbox v-for="perm in availablePermissions" :key="perm.value" :label="perm.value">
                  {{ perm.label }}
                </el-checkbox>
              </el-checkbox-group>
            </el-form-item>
          </el-form>
          <template #footer>
            <span class="dialog-footer">
              <el-button @click="permissionDialogVisible = false">取消</el-button>
              <el-button type="primary" @click="submitPermission">保存</el-button>
            </span>
          </template>
        </el-dialog>
      </el-tab-pane>
    </el-tabs>
  </el-card>
</template>
