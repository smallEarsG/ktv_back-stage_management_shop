import test from 'node:test'
import assert from 'node:assert/strict'
import { skuFields, specsFromFields, dimensionsFromSkus, addSkuCombinations, skuPayload } from '../src/lib/mall-product-editor.js'

test('visual specification fields preserve punctuation without requiring delimiters', () => {
  const sku = skuFields({ id: 12, specs: { '尺寸=标识': 'A;B', 颜色: '暖红' }, stock: 9, price: 20 })
  assert.deepEqual(specsFromFields(sku.fields), sku.specs)
  assert.throws(() => specsFromFields([{ name: '颜色', value: '' }]), /完整填写/)
  assert.throws(() => specsFromFields([{ name: '颜色', value: '红' }, { name: ' 颜色 ', value: '蓝' }]), /重复/)
})

test('combination additions preserve existing identity, codes, shared stock and edited prices', () => {
  const original = [skuFields({ id: 12, skuCode: 'ORIGINAL', specs: { 颜色: '红', 容量: '400ml' }, price: 39.9, stock: 17, sharedInventory: true })]
  const dimensions = dimensionsFromSkus(original)
  dimensions[0].values.push('白'); dimensions[1].values.push('500ml')
  const result = addSkuCombinations(original, dimensions, 'GEN')
  assert.equal(result.length, 4)
  assert.deepEqual(result[0], original[0])
  assert.equal(new Set(result.map(item => item.skuCode)).size, 4)
  assert.equal(result[1].stock, 0)
  assert.equal(addSkuCombinations(result, dimensions, 'SECOND').length, 4)
  const payload = skuPayload(result, 'FALLBACK')
  assert.equal(payload[0].id, 12)
  assert.equal(Object.hasOwn(payload[0], 'stock'), false)
  assert.equal(payload[1].stock, 0)
})

test('only a pristine unsaved default is replaced, custom and historical variants stay', () => {
  const dimensions = [{ name: '颜色', values: ['红', '白'] }]
  assert.equal(addSkuCombinations([skuFields({ price: 0.01, stock: 0 })], dimensions, 'A').length, 2)
  assert.equal(addSkuCombinations([skuFields({ price: 20, stock: 0 })], dimensions, 'B').length, 3)
  assert.equal(addSkuCombinations([skuFields({ id: 7, price: 0.01, stock: 0 })], dimensions, 'C').length, 3)
  const historical = [skuFields({ id: 1, skuCode: 'OLD1', specs: {}, price: 10 }), skuFields({ id: 2, skuCode: 'OLD2', specs: {}, price: 20 })]
  assert.equal(skuPayload(historical, 'NEW').length, 2)
})

test('generation and submission refuse duplicate, incomplete or oversized specifications', () => {
  assert.throws(() => addSkuCombinations([], [{ name: '颜色', values: [] }], 'A'), /添加规格值/)
  assert.throws(() => addSkuCombinations([], [{ name: '颜色', values: ['红'] }, { name: '颜色', values: ['蓝'] }], 'A'), /重复/)
  assert.throws(() => addSkuCombinations([], [{ name: '值', values: Array.from({ length: 101 }, (_, i) => i) }], 'A'), /100/)
  assert.throws(() => skuPayload([skuFields({ skuCode: 'DUP', specs: { 颜色: '红' } }), skuFields({ skuCode: 'DUP', specs: { 颜色: '白' } })], 'A'), /编码/)
  assert.throws(() => skuPayload([skuFields({ skuCode: 'A', specs: { 颜色: '红' } }), skuFields({ skuCode: 'B', specs: { 颜色: '红' } })], 'A'), /组合重复/)
})
