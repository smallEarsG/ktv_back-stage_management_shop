import assert from 'node:assert/strict'
import { test } from 'node:test'
import { inventorySummary, skuInventory } from './inventory.js'

test('one empty specification raises a warning even when aggregate stock is abundant', () => {
  const summary = inventorySummary({ stock: 100, skus: [
    { stockQuantity: 0, lowStockThreshold: 10 },
    { stockQuantity: 100, lowStockThreshold: 10 }
  ] })
  assert.deepEqual(summary, { stock: 100, skuCount: 2, lowCount: 1, threshold: null })
})

test('a zero threshold disables early warnings while zero stock still shows shortage', () => {
  assert.equal(skuInventory({ stock: 1, lowStockThreshold: 0 }).low, false)
  assert.equal(skuInventory({ stock: 0, lowStockThreshold: 0 }).low, true)
  assert.equal(inventorySummary({ stock: 1, lowStockThreshold: 0 }).threshold, 0)
  assert.equal(skuInventory({ stock: 10, lowStockThreshold: 10 }).low, false)
})
