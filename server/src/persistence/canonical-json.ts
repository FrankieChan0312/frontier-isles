/** Sorted object keys and ordered arrays, with a bounded plain-data traversal. */
export function canonicalJson(value: unknown, depth = 0): string {
  if (depth > 32) throw new Error('Serializable data exceeds its depth limit.')
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value)
  if (Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype) {
    return `[${value.map((entry: unknown) => canonicalJson(entry, depth + 1)).join(',')}]`
  }
  if (typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype) {
    const record = value as Readonly<Record<string, unknown>>
    const keys = Object.keys(record).sort()
    if (keys.some((key) => key === '__proto__' || key === 'constructor' || key === 'prototype')) throw new Error('Unsafe serializable key.')
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key], depth + 1)}`).join(',')}}`
  }
  throw new Error('Serializable data must be finite plain JSON.')
}
