const prefix = import.meta.env.VITE_STORAGE_PREFIX || ''

export const authStorage = {
  getItem: key => localStorage.getItem(prefix + key),
  setItem: (key, value) => localStorage.setItem(prefix + key, value),
  removeItem: key => localStorage.removeItem(prefix + key)
}
