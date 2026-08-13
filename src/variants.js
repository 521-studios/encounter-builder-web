// Resolve a chosen item-variant NAME (how the treasure line stores it) to its
// index in the item's stat_block.variants (what the library ItemCard takes).
// '' or an unknown name → -1: no version selected yet. A versioned item requires
// the GM to lock one in (the library renders nothing selected until they do).
export function variantIndex(variants, name) {
  return (variants || []).findIndex((v) => v.name === name)
}
