import { reactive, onBeforeUnmount } from 'vue'
import request from '@/lib/request'
import { createLatestResource } from '@/lib/latest-resource'

export function useFinanceResource(path) {
  const state = reactive({ data: null, loading: false, error: '', updatedAt: '' })
  const resource = createLatestResource(state, params => request.get(typeof path === 'function' ? path(params) : path, {
    params: typeof path === 'function' ? undefined : params,
    silent: true
  }))
  onBeforeUnmount(resource.dispose)
  return Object.assign(state, { load: resource.load })
}
