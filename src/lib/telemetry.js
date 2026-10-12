const routeWords = new Set('api customer auth login user products categories orders payments payment refunds wechat dining sessions cart quote settle services aftersales prints kitchen seats shifts config store rooms dashboard finance summary warehouse group-buy records prepare verify cancel bill fulfill reconciliation operations platform merchants members coupons settings menu scan me detail list confirm apply index pages'.split(' '))
export function telemetryRoute(value) {
  const path = String(value || '/unknown').split(/[?#]/)[0]
  if (!path.startsWith('/') || path.includes('://')) return '/unknown'
  return '/' + path.split('/').filter(Boolean).map(part => routeWords.has(part) ? part : ':value').join('/').slice(0, 230)
}
export function createTelemetryReporter({ baseURL, getToken, getStore, send = (...args) => globalThis.fetch?.(...args), now = Date.now }) {
  let busy = false, minute = -1, count = 0
  const recent = new Map()
  return async function report(kind, route) {
    try {
      if (!['NETWORK', 'RUNTIME', 'UNHANDLED'].includes(kind) || busy) return
      const token = getToken(), store = getStore()
      if (!token || store == null || store === '') return
      const current = now(), bucket = Math.floor(current / 60000)
      if (bucket !== minute) { minute = bucket; count = 0; recent.clear() }
      const clean = telemetryRoute(route), key = kind + clean
      if (count >= 20 || (recent.has(key) && current - recent.get(key) < 5000)) return
      recent.set(key, current); count++; busy = true
      const controller = typeof AbortController === 'undefined' ? null : new AbortController()
      const timeout = controller ? setTimeout(() => controller.abort(), 4000) : null
      try {
        await send(baseURL.replace(/\/$/, '') + '/telemetry', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Store-Id': String(store) }, body: JSON.stringify({ kind, route: clean }), signal: controller?.signal })
      } finally { if (timeout) clearTimeout(timeout); busy = false }
    } catch { busy = false }
  }
}
export function installTelemetry(app, report) {
  const route = () => window.location.pathname
  window.addEventListener('error', () => { report('RUNTIME', route()) })
  window.addEventListener('unhandledrejection', () => { report('UNHANDLED', route()) })
  const previous = app.config.errorHandler
  app.config.errorHandler = (error, instance, info) => { report('RUNTIME', route()); if (previous) previous(error, instance, info) }
}
