// Pure helpers shared by the cashier and workbench; monetary amounts remain server-owned.
export const nextOrderStatus = status => ({ 20: 30, 30: 40, 40: 50 }[Number(status)] ?? null)

export function createSubmissionTracker(createId) {
  let pending = null
  return {
    prepare(body) {
      const signature = JSON.stringify(body)
      if (!pending || pending.signature !== signature) {
        pending = { signature, body: { ...body, clientOrderNo: createId() } }
      }
      return pending.body
    },
    clear() { pending = null }
  }
}
