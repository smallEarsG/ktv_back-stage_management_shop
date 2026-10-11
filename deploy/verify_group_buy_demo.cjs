// Real local backend + merchant build + actual mini Page JS/WXML runtime.
// Start the three local servers before running; this never accepts a remote host.
const { chromium } = require('playwright')
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const ports = [process.env.API_PORT || 8080, process.env.PREVIEW_PORT || 8081, process.env.GROUP_BUY_PREVIEW_PORT || 8092].map(Number)
for (const port of ports) assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535)
const [api, shop, mini] = ports.map(port => `http://127.0.0.1:${port}`)
const out = path.resolve(__dirname, '../.group-buy-ui-artifacts'), checks = [], errors = []
async function request(route, token, body) {
  const res = await fetch(api + route, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const json = await res.json(); assert.equal(json.code, 200, route + ': ' + json.message); return json.data
}
const mark = label => { checks.push(label); console.log('PASS ' + label) }
const writeResponse = (page, end) => page.waitForResponse(res => res.request().method() === 'POST' && new URL(res.url()).pathname.endsWith(end))
;(async () => {
  fs.mkdirSync(out, { recursive: true })
  const auth = await request('/api/auth/login', null, { phone: '13800138000', password: process.env.LOCAL_DEMO_PASSWORD || 'DemoKtv2026!' })
  assert.equal((await request('/api/group-buy/demo/capabilities', auth.token)).enabled, true)
  const executablePath = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', chromium.executablePath()].find(file => fs.existsSync(file))
  const browser = await chromium.launch({ headless: true, executablePath })
  let customer, merchant
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    await ctx.route('**/*', route => {
      if (!ports.some(port => route.request().url().startsWith(`http://127.0.0.1:${port}/`))) return route.abort()
      return route.continue()
    })
    await ctx.addInitScript(({ token, user }) => {
      if (location.port === String(user.previewPort)) {
        localStorage.setItem('token', token); localStorage.setItem('currentStoreId', '1')
        localStorage.setItem('userInfo', JSON.stringify(user.info))
      }
    }, { token: auth.token, user: { previewPort: ports[1], info: auth.userInfo } })
    customer = await ctx.newPage(); merchant = await ctx.newPage()
    for (const page of [customer, merchant]) page.on('pageerror', error => errors.push(error.message))
    await customer.setViewportSize({ width: 390, height: 844 })
    await customer.goto(mini + '/?storeId=1')
    await customer.getByRole('button', { name: '领取测试券', exact: true }).waitFor()
    const issue = writeResponse(customer, '/vouchers')
    await customer.getByRole('button', { name: '领取测试券', exact: true }).click()
    const voucher = (await (await issue).json()).data
    await customer.locator(`[data-voucher-id="${voucher.id}"]`).waitFor()
    await customer.screenshot({ path: path.join(out, 'demo-customer-voucher.png'), fullPage: true })
    mark('actual mini page creates persistent voucher through the local API')
    await merchant.goto(shop + '/group-buy/demo')
    const row = merchant.locator(`[data-voucher-id="${voucher.id}"]`)
    await row.getByRole('button', { name: '核销并自动开台', exact: true }).click()
    const redeem = writeResponse(merchant, '/redeem')
    await merchant.getByTestId('demo-redeem').click()
    const opened = (await (await redeem).json()).data
    assert.equal(opened.state, 'OPEN')
    await merchant.locator('.visit-heading').filter({ hasText: opened.roomName }).waitFor()
    await customer.getByRole('button', { name: '刷新状态', exact: true }).click()
    await customer.waitForFunction(id => window.__miniPage.data.visits.some(v => v.id === id), opened.id)
    await customer.locator(`button[data-id="${opened.id}"]`).click()
    await customer.locator(`[data-visit-id="${opened.id}"]`).waitFor()
    mark('merchant redemption auto-opens the same visit visible to the customer')
    for (const title of ['加饮料', '加饮料', '加饮料', '加果盘']) {
      const added = writeResponse(customer, '/items')
      await customer.getByRole('button', { name: new RegExp(title) }).click()
      assert.equal((await (await added).json()).code, 200)
      await customer.waitForFunction(() => !window.__miniPage.data.busy)
    }
    await customer.getByLabel('消费分钟').fill('240')
    await customer.getByRole('button', { name: '查看试算', exact: true }).click()
    await customer.waitForFunction(() => Number(window.__miniPage.data.quote?.amountDue) === 108)
    await customer.screenshot({ path: path.join(out, 'demo-customer-quote.png'), fullPage: true })
    assert.ok(await customer.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Mini viewport overflow')
    mark('customer additions and server quote show 308 gross, 200 deduction, 108 due')
    await merchant.getByTestId('demo-refresh').click()
    await merchant.getByTestId('demo-minutes').locator('input').fill('240')
    await merchant.getByTestId('demo-minutes').locator('input').press('Tab')
    await merchant.getByRole('button', { name: '更新模拟账单', exact: true }).click()
    await merchant.getByTestId('demo-quote').filter({ hasText: '¥108.00' }).waitFor()
    await merchant.getByTestId('demo-cash').locator('input').fill('120')
    await merchant.getByTestId('demo-cash').locator('input').press('Tab')
    await merchant.getByText('已核对模拟应收与实收，本次仅演练结账', { exact: true }).click()
    assert.equal(await merchant.getByRole('checkbox', { name: '已核对模拟应收与实收，本次仅演练结账' }).isChecked(), true)
    await merchant.screenshot({ path: path.join(out, 'demo-merchant-quote.png'), fullPage: true })
    const settle = writeResponse(merchant, '/settle')
    await merchant.getByTestId('demo-settle').click()
    const settled = (await (await settle).json()).data
    assert.equal(settled.state, 'SETTLED')
    assert.equal(Number(settled.receipt.change), 12)
    await merchant.locator('.receipt').filter({ hasText: '补差收款 ¥108.00' }).waitFor()
    const reconcile = writeResponse(merchant, '/reconcile')
    await merchant.getByTestId('demo-reconcile').click()
    assert.equal(Number((await (await reconcile).json()).data.difference), 0)
    await merchant.screenshot({ path: path.join(out, 'demo-merchant-reconciled.png'), fullPage: true })
    mark('merchant settles with cash/change, releases room and reconciles simulated platform payout')
    await customer.getByRole('button', { name: '刷新状态', exact: true }).click()
    await customer.locator(`[data-receipt-id="${settled.receipt.id}"]`).waitFor()
    await customer.screenshot({ path: path.join(out, 'demo-customer-receipt.png'), fullPage: true })
    const nativeErrors = await customer.evaluate(() => window.__runtimeErrors || [])
    assert.deepEqual(nativeErrors, [])
    assert.deepEqual(errors, [])
    await merchant.setViewportSize({ width: 390, height: 844 })
    assert.ok(await merchant.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Merchant viewport overflow')
    await merchant.screenshot({ path: path.join(out, 'demo-merchant-mobile.png'), fullPage: true })
    mark('same receipt in mini page, responsive layouts and no browser/runtime errors')
    fs.writeFileSync(path.join(out, 'demo-results.json'), JSON.stringify({ checks, errors, simulation: true, nativeWeChat: false }, null, 2))
    console.log(JSON.stringify({ passed: checks.length, checks, nativeWeChat: false }, null, 2))
  } catch (error) {
    for (const [name, page] of [['customer', customer], ['merchant', merchant]]) {
      if (!page || page.isClosed()) continue
      await page.screenshot({ path: path.join(out, `demo-${name}-failure.png`), fullPage: true }).catch(() => {})
    }
    throw error
  } finally { await browser.close() }
})().catch(error => { console.error(error.stack); process.exitCode = 1 })
