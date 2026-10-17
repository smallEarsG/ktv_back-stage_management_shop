const signature = specs => JSON.stringify(Object.entries(specs || {}).sort(([a], [b]) => a.localeCompare(b)))

export function skuFields(sku = {}) {
  return { ...sku, fields: Object.entries(sku.specs || {}).map(([name, value]) => ({ name, value: String(value) })) }
}

export function specsFromFields(fields = []) {
  const entries = fields.map(field => [String(field.name || '').trim(), String(field.value || '').trim()])
  if (entries.some(([name, value]) => !name || !value)) throw new Error('请完整填写规格名称和规格值，或移除空白项')
  if (new Set(entries.map(([name]) => name)).size !== entries.length) throw new Error('同一规格内的名称不能重复')
  return Object.fromEntries(entries)
}

export function dimensionsFromSkus(skus) {
  const dimensions = new Map()
  for (const sku of skus) for (const [name, value] of Object.entries(sku.specs || {})) {
    if (!dimensions.has(name)) dimensions.set(name, new Set())
    dimensions.get(name).add(String(value))
  }
  return [...dimensions].map(([name, values]) => ({ name, values: [...values], draft: '' }))
}

// Generate additions only. Existing IDs, stock, bindings and merchant edits survive.
export function addSkuCombinations(skus, dimensions, prefix) {
  if (!dimensions.length) throw new Error('请先添加规格名称和规格值')
  const names = dimensions.map(item => String(item.name || '').trim())
  if (names.some(name => !name) || new Set(names).size !== names.length) throw new Error('规格名称不能为空或重复')
  let combinations = [{}]
  for (const [index, dimension] of dimensions.entries()) {
    const values = [...new Set(dimension.values.map(value => String(value).trim()).filter(Boolean))]
    if (!values.length) throw new Error(`请为“${names[index]}”添加规格值`)
    if (combinations.length * values.length > 100) throw new Error('一次最多生成100个规格组合，请减少规格值')
    combinations = combinations.flatMap(specs => values.map(value => ({ ...specs, [names[index]]: value })))
  }
  const pristineDefault = skus.length === 1 && !skus[0].id && !skus[0].skuCode && !(skus[0].fields || skuFields(skus[0]).fields).length && Number(skus[0].stock || 0) === 0 && Number(skus[0].price) === 0.01
  const result = (pristineDefault ? [] : skus).map(sku => ({ ...sku, fields: (sku.fields || skuFields(sku).fields).map(field => ({ ...field })) }))
  const existing = new Set(result.map(sku => signature(specsFromFields(sku.fields))))
  for (const specs of combinations) if (!existing.has(signature(specs))) {
    result.push(skuFields({ skuCode: `${prefix}-${result.length + 1}`, specs, price: Number(skus[0]?.price || 0.01), stock: 0, weightGrams: Number(skus[0]?.weightGrams || 0) }))
  }
  if (result.length > 100) throw new Error('当前规格超过100个，请先移除不需要的规格')
  return result
}

export function skuPayload(skus, prefix) {
  const codes = new Set(), specsSeen = new Map()
  return skus.map((sku, index) => {
    const specs = specsFromFields(sku.fields || skuFields(sku).fields)
    const key = signature(specs), skuCode = String(sku.skuCode || `${prefix}-${index + 1}`).trim()
    if (!skuCode || codes.has(skuCode)) throw new Error('规格编码不能为空或重复')
    const unchanged = !!sku.id && signature(sku.specs) === key
    if (specsSeen.has(key) && (!unchanged || !specsSeen.get(key))) throw new Error('规格组合重复，请合并重复规格')
    codes.add(skuCode); specsSeen.set(key, unchanged)
    return { ...(sku.id ? { id: sku.id } : { stock: Number(sku.stock || 0) }), skuCode, specs, price: sku.price, weightGrams: Number(sku.weightGrams || 0) }
  })
}
