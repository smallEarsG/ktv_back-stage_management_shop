export function skuInventory(sku, fallbackThreshold = 10) {
  const stock = Number(sku?.stock ?? sku?.stockQuantity ?? sku?.stock_quantity ?? 0)
  const threshold = Number(sku?.lowStockThreshold ?? sku?.low_stock_threshold ?? fallbackThreshold)
  return { stock, threshold, low: stock === 0 || stock < threshold }
}

export function inventorySummary(product) {
  const skus = Array.isArray(product?.skus) && product.skus.length ? product.skus : [product]
  const items = skus.map(sku => skuInventory(sku, product?.lowStockThreshold ?? 10))
  return {
    stock: items.reduce((sum, item) => sum + item.stock, 0),
    skuCount: items.length,
    lowCount: items.filter(item => item.low).length,
    outCount: items.filter(item => item.stock === 0).length,
    threshold: items.length === 1 ? items[0].threshold : null
  }
}
