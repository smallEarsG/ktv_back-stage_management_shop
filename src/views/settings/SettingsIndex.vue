<script setup lang="ts">
import { ref } from 'vue'

const activeTab = ref('store')
</script>

<template>
  <el-card>
    <el-tabs v-model="activeTab">
      <el-tab-pane label="门店资料" name="store">
        <el-form label-width="120px" class="max-w-lg mt-4">
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
        <div class="mb-4">
          <el-button type="primary">添加员工</el-button>
        </div>
        <el-table :data="[{name: '张三', role: '店长', phone: '13800000000'}]" border>
          <el-table-column prop="name" label="姓名" />
          <el-table-column prop="role" label="角色" />
          <el-table-column prop="phone" label="手机号" />
          <el-table-column label="操作">
            <template #default>
              <el-button link type="primary">权限设置</el-button>
              <el-button link type="danger">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>
  </el-card>
</template>
