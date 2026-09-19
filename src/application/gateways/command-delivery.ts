export interface CommandDeliveryOptions {
  readonly acknowledgementTimeoutMs?: number
  readonly maxRetries?: number
  readonly retryDelayMs?: number
  readonly maxRetryDelayMs?: number
  readonly reconnectTimeoutMs?: number
  readonly queueCapacity?: number
}

export interface CommandDeliverySettings {
  readonly acknowledgementTimeoutMs: number
  readonly maxRetries: number
  readonly retryDelayMs: number
  readonly maxRetryDelayMs: number
  readonly reconnectTimeoutMs: number
  readonly queueCapacity: number
}

function bounded(value: number, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error('Invalid command delivery setting.')
  return value
}

export function commandDeliverySettings(options: CommandDeliveryOptions = {}): CommandDeliverySettings {
  const settings = {
    acknowledgementTimeoutMs: bounded(options.acknowledgementTimeoutMs ?? 8_000, 1, 60_000),
    maxRetries: bounded(options.maxRetries ?? 2, 0, 5),
    retryDelayMs: bounded(options.retryDelayMs ?? 250, 0, 30_000),
    maxRetryDelayMs: bounded(options.maxRetryDelayMs ?? 1_000, 0, 30_000),
    reconnectTimeoutMs: bounded(options.reconnectTimeoutMs ?? 30_000, 1, 60_000),
    queueCapacity: bounded(options.queueCapacity ?? 8, 1, 32),
  }
  if (settings.maxRetryDelayMs < settings.retryDelayMs) throw new Error('Retry delay must not exceed its bound.')
  return Object.freeze(settings)
}

export function abortable<T>(task: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const cancel = (): void => reject(new Error('The game session changed. Pending delivery was cancelled.'))
    if (signal.aborted) cancel()
    else signal.addEventListener('abort', cancel, { once: true })
    void task.then((value) => {
      signal.removeEventListener('abort', cancel)
      resolve(value)
    }, (error: unknown) => {
      signal.removeEventListener('abort', cancel)
      reject(error)
    })
  })
}

export function deliveryDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const cancel = (): void => {
      clearTimeout(timer)
      reject(new Error('The game session changed. Pending delivery was cancelled.'))
    }
    const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve() }, milliseconds)
    if (signal.aborted) cancel()
    else signal.addEventListener('abort', cancel, { once: true })
  })
}
