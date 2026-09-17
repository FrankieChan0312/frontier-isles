export class GameQueueFullError extends Error {
  public constructor() { super('The game execution queue is full.') }
}

/** Admission order is execution order, including across asynchronous AI decisions. */
export class GameExecutionQueue {
  readonly #capacity: number
  #tail: Promise<void> = Promise.resolve()
  #size = 0
  #controlSize = 0

  public constructor(capacity = 64) {
    if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 256) {
      throw new Error('Game queue capacity must be an integer between 1 and 256.')
    }
    this.#capacity = capacity
  }

  public get size(): number { return this.#size }
  public idle(): Promise<void> { return this.#tail }

  public run<T>(operation: () => T | Promise<T>, control = false): Promise<T> {
    // Reserve bounded FIFO positions for disconnect/expiry even when clients fill admission.
    if (control ? this.#controlSize >= 16 : this.#size - this.#controlSize >= this.#capacity) return Promise.reject(new GameQueueFullError())
    this.#size += 1
    if (control) this.#controlSize += 1
    const result = this.#tail.then(operation).finally(() => { this.#size -= 1; if (control) this.#controlSize -= 1 })
    // A failed operation must release its position without poisoning subsequent work.
    this.#tail = result.then(() => {}, () => {})
    return result
  }
}
