// Natural (alphanumeric) ordering for the encounter sidebar: numeric runs sort
// by value, not lexically, so "2" < "10" and "B2" < "B10". This is exactly what
// Intl.Collator with { numeric: true } does natively — no hand-rolled parser.
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

// naturalCompare(a, b): a comparator for Array.prototype.sort over strings.
export const naturalCompare = (a, b) => collator.compare(String(a), String(b))

// naturalSort(items, key): a new array sorted by key(item) naturally. Defaults
// to identity so it works on a bare string array. Non-mutating (copies first).
export const naturalSort = (items, key = (x) => x) =>
  [...items].sort((a, b) => naturalCompare(key(a), key(b)))
