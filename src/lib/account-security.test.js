import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { test } from 'node:test'
import { reactive, ref } from 'vue'

const source = fs.readFileSync(new URL('../views/AccountSecurity.vue', import.meta.url),'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm,'')
function page() {
  let resolve, reject, unmount, logouts=0
  const task=new Promise((yes,no)=>{resolve=yes;reject=no}), state=reactive({token:'session-A',userInfo:{id:1},logout(){logouts++}})
  const context={ref,reactive,useUserStore:()=>state,request:{post:()=>task},TextEncoder,onBeforeUnmount:fn=>{unmount=fn},ElMessage:{success(){}}}
  vm.runInNewContext(source+'\napi={form,submit,error,busy}',context)
  Object.assign(context.api.form,{currentPassword:'current-example',newPassword:'new-example-123',confirmPassword:'new-example-123'})
  return {...context.api,state,resolve,reject,unmount:()=>unmount(),logouts:()=>logouts}
}
for(const outcome of ['success','failure']) test(`old password ${outcome} cannot affect a new login`,async()=>{
  const p=page(), submitted=p.submit();p.unmount();p.state.token='session-B';p.state.userInfo={id:2}
  if(outcome==='success')p.resolve({});else p.reject(new Error('old failure'))
  await submitted;assert.equal(p.logouts(),0);assert.equal(p.error.value,'')
})
test('current mounted password success still logs out and clears input',async()=>{
  const p=page(),submitted=p.submit();p.resolve({});await submitted;assert.equal(p.logouts(),1);assert.equal(p.form.newPassword,'')
})
