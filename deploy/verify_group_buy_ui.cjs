// Offline browser acceptance: all API responses are fixtures, no real voucher or merchant is touched.
const { chromium } = require('playwright')
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict')
const id = 'e6f59745-89a2-4a98-b211-7889ef1fb6fd'
const root = path.resolve(__dirname, '../dist'), out = path.resolve(__dirname, '../.group-buy-ui-artifacts')
const channels = ready => [{ platform: 'DOUYIN', name: '抖音团购', ready, status: ready ? '已配置，需平台验券确认授权' : '未开通', description: '需应用取得团购核销权限，商家在抖音来客授权，并绑定当前门店。当前支持普通单次团购券。', url: 'https://partner.open-douyin.com/' }, { platform: 'MEITUAN', name: '美团 / 大众点评', ready: false, status: '待开通与接口对接', description: '需在美团技术服务合作中心申请与KTV行业匹配的团购核销能力，取得当前接口文档并完成商家授权。', url: 'https://developer.meituan.com/' }]
;(async () => {
  fs.mkdirSync(out, { recursive: true })
  const server = http.createServer((req, res) => {
    let file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname))
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) file = path.join(root, 'index.html')
    res.setHeader('Content-Type', { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png' }[path.extname(file)] || 'application/octet-stream')
    res.end(fs.readFileSync(file))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const executable = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', chromium.executablePath()].find(file => fs.existsSync(file))
  const browser = await chromium.launch({ headless: true, executablePath: executable })
  const errors = [], writes = [], checks = []
  const check = name => { checks.push(name); console.log('PASS ' + name) }
  const url = `http://127.0.0.1:${server.address().port}/group-buy`
  async function context(unknown = false) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    let ready = false, record = null
    await context.addInitScript(() => {
      localStorage.setItem('token', 'offline-test-token'); localStorage.setItem('currentStoreId', '1')
      localStorage.setItem('userInfo', JSON.stringify({ id: 9, storeId: 1, role: 'admin', username: '验收门店', permissions: ['pos:view'] }))
    })
    await context.route('**/*', async route => {
      const request = route.request(), pathname = new URL(request.url()).pathname
      if (pathname.startsWith('/api/')) {
        let data
        if (pathname === '/api/auth/user') data = { id: 9, storeId: 1, role: 'admin', username: '验收门店', permissions: ['pos:view'] }
        else if (pathname.endsWith('/channels')) data = channels(ready)
        else if (pathname.endsWith('/records')) data = { list: record ? [record] : [], total: record ? 1 : 0 }
        else if (pathname.endsWith('/prepare')) data = { id, platform: 'DOUYIN', expiresAt: '2026-10-11T23:59:59', certificates: [{ id: 'cert-1', title: '双人欢唱套餐 · 3小时', codeMask: '**** 9012', payAmount: 99, faceValue: 129 }] }
        else if (pathname.endsWith('/verify')) {
          writes.push(request.postDataJSON())
          record ||= { id, platform: 'DOUYIN', operatorId: 9, title: '双人欢唱套餐 · 3小时', codeMask: '**** 9012', payAmount: 99, state: unknown ? 'UNKNOWN' : 'VERIFIED', message: unknown ? '核销结果待确认，请查询平台状态并核对原记录，勿重新核销' : '平台已确认核销成功', createdAt: '2026-10-11T11:35:00', verifyId: unknown ? null : 'verify-1' }
          data = record
        } else if (pathname.endsWith('/query')) { record.remoteStatus = '平台显示本门店已核销'; data = record }
        else if (pathname.endsWith('/cancel')) { record.state = 'CANCELLED'; record.message = '平台已确认撤销核销成功'; data = record }
        else throw new Error('Unexpected offline API ' + pathname)
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200, data }) })
      }
      if (!request.url().startsWith('http://127.0.0.1:')) return route.abort()
      return route.continue()
    })
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message))
    await page.goto(url); await page.getByRole('heading', { name: '团购核销', exact: true }).waitFor()
    return { page, context, enable: () => { ready = true } }
  }
  async function verify(page) {
    await page.getByPlaceholder('用扫码枪读取二维码，或输入抖音12位/15位券码').fill('123456789012')
    await page.getByRole('button', { name: '验券查询', exact: true }).click()
    await page.getByRole('button', { name: '确认核销所选券' }).click()
    await page.getByRole('dialog').getByRole('button', { name: '确认核销', exact: true }).click()
  }
  try {
    const uncertain = await context(true), page = uncertain.page
    await page.locator('.channel').first().waitFor()
    await page.screenshot({ path: path.join(out, 'unconfigured.png'), fullPage: true })
    assert.equal(await page.getByRole('button', { name: '确认核销所选券' }).count(), 0)
    await page.locator('.channel').filter({ hasText: '美团 / 大众点评' }).click()
    await page.locator('.empty-channel').filter({ hasText: '待开通与接口对接' }).waitFor(); check('unopened channels cannot redeem')
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: path.join(out, 'mobile-unconfigured.png'), fullPage: true })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'mobile page must not overflow')
    check('mobile page fits viewport')
    await page.setViewportSize({ width: 1440, height: 1000 }); uncertain.enable()
    await page.getByRole('button', { name: '刷新记录' }).click()
    await page.locator('.channel').filter({ hasText: '抖音团购' }).click()
    await verify(page)
    await page.locator('.pending-box').waitFor()
    assert.equal(await page.getByPlaceholder('用扫码枪读取二维码，或输入抖音12位/15位券码').isDisabled(), true)
    await page.getByRole('button', { name: '查询原平台状态' }).click()
    await page.locator('.pending-box').filter({ hasText: '券已使用也可能来自其他操作' }).waitFor()
    await page.screenshot({ path: path.join(out, 'unknown.png'), fullPage: true })
    await page.getByRole('button', { name: '重试原核销请求' }).click()
    await page.waitForFunction(() => !document.querySelector('.pending-box button')?.disabled)
    assert.equal(writes.length, 2); assert.deepEqual(writes[0], writes[1]); check('unknown operations retain the same intent and block new vouchers')
    const confirmed = await context(false); confirmed.enable()
    await confirmed.page.getByRole('button', { name: '刷新记录' }).click()
    await verify(confirmed.page)
    await confirmed.page.locator('.el-table__body tr').filter({ hasText: '核销成功' }).waitFor()
    assert.equal(await confirmed.page.locator('.pending-box').count(), 0)
    await confirmed.page.getByRole('button', { name: '撤销核销', exact: true }).click()
    await confirmed.page.locator('.el-message-box__input input').fill('误选套餐')
    await confirmed.page.getByRole('dialog').getByRole('button', { name: '确认撤销', exact: true }).click()
    await confirmed.page.locator('.el-table__body tr').filter({ hasText: '已撤销' }).waitFor()
    await confirmed.page.screenshot({ path: path.join(out, 'cancelled.png'), fullPage: true }); check('confirmed redemption and administrator cancellation update the ledger')
    assert.deepEqual(errors, []); check('no browser runtime errors')
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ offline: true, checks, errors }, null, 2))
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)) }
})().catch(error => { console.error(error); process.exitCode = 1 })
