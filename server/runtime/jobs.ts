/**
 * BACKGROUND JOBS, independent of the runtime. Engines register what they run and how often;
 * a driver decides how time passes. Under Node one timer wakes the registry at the next due job;
 * on Cloudflare a Durable Object alarm calls `runDue()` and re-arms itself at `nextDue()`.
 * Same semantics in both: a job runs at most once per period, a failure never stops the others.
 */

type Job = { every: number; next: number; run: () => unknown; once: boolean; running: boolean }
const jobs = new Map<string, Job>()

/** How the registry is woken up when the next due time changes. */
export type Driver = { wake(at: number): void }

let timer: ReturnType<typeof setTimeout> | undefined
/** Node: one unref'd timer at the next due job (never keeps a test run or the process alive). */
export const nodeDriver: Driver = {
  wake(at) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void runDue(), Math.max(0, at - Date.now()))
    timer.unref?.()
  },
}
let driver: Driver = nodeDriver
export const setDriver = (d: Driver) => {
  driver = d
  reschedule()
}

function reschedule() {
  const at = nextDue()
  if (at !== undefined) driver.wake(at)
}

/** Runs `run` every `everyMs`, first after `firstMs` (default: one period). Re-registering an id replaces it. */
export function every(id: string, everyMs: number, run: () => unknown, firstMs = everyMs) {
  jobs.set(id, { every: everyMs, next: Date.now() + firstMs, run, once: false, running: false })
  reschedule()
}

/** Runs `run` once, after `ms`. */
export function once(id: string, ms: number, run: () => unknown) {
  jobs.set(id, { every: 0, next: Date.now() + ms, run, once: true, running: false })
  reschedule()
}

export const cancel = (id: string) => void jobs.delete(id)

/** Earliest due time among registered jobs, or undefined when there are none. */
export function nextDue(): number | undefined {
  let at: number | undefined
  for (const j of jobs.values()) if (at === undefined || j.next < at) at = j.next
  return at
}

/** Runs every job that is due (each at most once), then re-arms the driver. */
export async function runDue(now = Date.now()): Promise<void> {
  const due = [...jobs.entries()].filter(([, j]) => j.next <= now && !j.running)
  await Promise.all(
    due.map(async ([id, j]) => {
      j.running = true
      if (j.once) jobs.delete(id)
      else j.next = now + j.every
      try {
        await j.run()
      } catch (e) {
        console.warn(`[jobs] ${id}: ${e instanceof Error ? e.message : String(e)}`)
      } finally {
        j.running = false
      }
    }),
  )
  reschedule()
}

/** Registered job ids (for health and tests). */
export const jobIds = () => [...jobs.keys()]
