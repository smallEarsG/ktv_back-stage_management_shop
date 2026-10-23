// Unknown-result writes must never be replayed into another deployment or account.
export function createRecoveryStorage(storage, actor = '', env = import.meta.env || {}, { isNonTransactionalLegacy = () => false } = {}) {
  const scope = JSON.stringify([env.VITE_API_BASE_URL || '/api', env.BASE_URL || '/', env.VITE_STORAGE_PREFIX || '', String(actor)])
  const keyFor = key => `ktv-recovery:v2:${encodeURIComponent(scope)}:${key}`
  function checkLegacy(key) {
    const legacy = storage.getItem(key)
    if (legacy !== null && legacy !== undefined && !isNonTransactionalLegacy(key, legacy)) {
      const error = new Error('发现旧版恢复记录，无法确认所属环境。请由店长核对原订单或流水后处理；原记录已保留，暂不能提交新操作。')
      error.code = 'RECOVERY_LEGACY'
      throw error
    }
  }
  return {
    getItem(key) { checkLegacy(key); return storage.getItem(keyFor(key)) },
    setItem(key, value) { checkLegacy(key); storage.setItem(keyFor(key), value) },
    removeItem(key) { storage.removeItem(keyFor(key)) }
  }
}

export function canReleaseRecovery(error) {
  const codes = [error?.code, error?.response?.data?.code, error?.response?.status, error?.statusCode].map(Number)
  if (codes.some(code => code === 401 || code === 403)) return false
  return codes.some(code => [400, 409, 422].includes(code))
}
