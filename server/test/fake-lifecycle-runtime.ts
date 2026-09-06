import type {
  RoomLifecycleRuntime,
  ScheduledLifecycleTask,
} from '../src/lobby/lifecycle-runtime.js'

interface FakeTask {
  readonly callback: () => void
  readonly dueAt: number
  readonly sequence: number
  cancelled: boolean
}

export class FakeLifecycleRuntime implements RoomLifecycleRuntime {
  #currentTime = 0
  #nextSequence = 0
  readonly #tasks: FakeTask[] = []

  public now(): number {
    return this.#currentTime
  }

  public schedule(delayMs: number, callback: () => void): ScheduledLifecycleTask {
    const task: FakeTask = {
      callback,
      dueAt: this.#currentTime + delayMs,
      sequence: this.#nextSequence++,
      cancelled: false,
    }
    this.#tasks.push(task)
    return { cancel: () => { task.cancelled = true } }
  }

  public advanceBy(durationMs: number): void {
    const target = this.#currentTime + durationMs
    while (true) {
      const next = this.#tasks
        .filter((task) => !task.cancelled && task.dueAt <= target)
        .sort((left, right) => left.dueAt - right.dueAt || left.sequence - right.sequence)[0]
      if (next === undefined) break
      next.cancelled = true
      this.#currentTime = next.dueAt
      next.callback()
    }
    this.#currentTime = target
  }
}
