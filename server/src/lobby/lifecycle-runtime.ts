export interface ScheduledLifecycleTask {
  cancel(): void
}

export interface RoomLifecycleRuntime {
  now(): number
  schedule(delayMs: number, callback: () => void): ScheduledLifecycleTask
}

export function createSystemRoomLifecycleRuntime(): RoomLifecycleRuntime {
  return Object.freeze({
    now: () => Date.now(),
    schedule: (delayMs: number, callback: () => void) => {
      const handle = setTimeout(callback, delayMs)
      handle.unref()
      return Object.freeze({ cancel: () => clearTimeout(handle) })
    },
  })
}
