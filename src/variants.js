// Resolve a chosen item-variant NAME (how the treasure line stores it) to its
// index in the item's stat_block.variants (what the library ItemCard takes).
// '' or an unknown name → 0, the base item.
export function variantIndex(variants, name) {
  const i = (variants || []).findIndex((v) => v.name === name)
  return i >= 0 ? i : 0
}
