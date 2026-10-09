export function createLatestResource(state, fetcher, now = () => new Date().toLocaleTimeString('zh-CN', { hour12: false })) {
  let version = 0
  let disposed = false
  const load = async (params = {}, clear = false) => {
    if (disposed) return false
    const current = ++version
    if (clear) { state.data = null; state.updatedAt = '' }
    state.loading = true
    state.error = ''
    try {
      const data = await fetcher(params)
      if (disposed || current !== version) return false
      state.data = data
      state.updatedAt = now()
      return true
    } catch {
      if (disposed || current !== version) return false
      state.error = state.data ? '更新失败，当前显示上次成功获取的数据。' : '加载失败，请重试。'
      return false
    } finally {
      if (!disposed && current === version) state.loading = false
    }
  }
  return { load, dispose: () => { disposed = true; version += 1 } }
}
