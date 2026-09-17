export interface ScheduledLifecycleTask {
  cancel(): void
}

export interface RoomLifecycleRuntime {
  now(): number
  schedule(delayMs: number, callback: () => void | Promise<void>): ScheduledLifecycleTask
}

export function createSystemRoomLifecycleRuntime(): RoomLifecycleRuntime {
  return Object.freeze({
    now: () => Date.now(),
    schedule: (delayMs: number, callback: () => void | Promise<void>) => {
      // Epoch deadlines can be far away after clock correction; Node otherwise wraps to 1ms.
      // Lifecycle callbacks recheck their authoritative deadline before expiring anything.
      const handle = setTimeout(() => { void callback() }, Math.min(2_147_483_647, Math.max(0, delayMs)))
      handle.unref()
      return Object.freeze({ cancel: () => clearTimeout(handle) })
    },
  })
}
