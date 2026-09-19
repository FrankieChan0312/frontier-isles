export const MAX_ROOMS = 64
export const MAX_CONNECTIONS = 320
export const MAX_PACKET_BYTES = 16_384
export const MAX_PACKET_DEPTH = 12
export const MAX_PACKET_NODES = 512

/** Apply before recursive schema validation. Never invoke caller-supplied getters. */
export function isBoundedJson(value: unknown): boolean {
  const pending: { readonly value: unknown; readonly depth: number }[] = [{ value, depth: 0 }]
  const seen = new Set<object>()
  let nodes = 0
  let bytes = 0
  while (pending.length > 0) {
    const entry = pending.pop()
    if (entry === undefined) return false
    nodes += 1
    if (nodes > MAX_PACKET_NODES || entry.depth > MAX_PACKET_DEPTH) return false
    const current = entry.value
    if (typeof current === 'string') {
      if (Buffer.byteLength(current) > MAX_PACKET_BYTES) return false
      bytes += Buffer.byteLength(JSON.stringify(current))
    }
    else if (typeof current === 'number') { if (!Number.isFinite(current)) return false; bytes += 24 }
    else if (typeof current === 'boolean' || current === null) bytes += 5
    else if (typeof current === 'object') {
      if (seen.has(current)) return false
      seen.add(current)
      const array = Array.isArray(current)
      const prototype: unknown = Object.getPrototypeOf(current)
      if (!array && prototype !== Object.prototype && prototype !== null) return false
      const properties = Object.getOwnPropertyDescriptors(current)
      if (Object.getOwnPropertySymbols(current).length !== 0) return false
      for (const [key, descriptor] of Object.entries(properties)) {
        if (array && key === 'length') continue
        if (!descriptor.enumerable || !('value' in descriptor) || key === '__proto__' || key === 'constructor' || key === 'prototype') return false
        if (array && !/^(0|[1-9]\d*)$/u.test(key)) return false
        bytes += Buffer.byteLength(JSON.stringify(key)) + 2
        pending.push({ value: descriptor.value as unknown, depth: entry.depth + 1 })
        if (pending.length + nodes > MAX_PACKET_NODES) return false
      }
      bytes += 2
    } else return false
    if (bytes > MAX_PACKET_BYTES) return false
  }
  return true
}
