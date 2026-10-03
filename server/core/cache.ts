type Entry<T> = { value: T; expires: number }

/** Tiny TTL cache that also coalesces concurrent loads of the same key. */
export class TtlCache<T> {
  private store = new Map<string, Entry<T>>()
  private inflight = new Map<string, Promise<T>>()

  private ttlMs: number

  constructor(ttlMs: number) {
    this.ttlMs = ttlMs
  }

  async get(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.store.get(key)
    if (hit && hit.expires > Date.now()) return hit.value
    const pending = this.inflight.get(key)
    if (pending) return pending
    const p = load()
      .then((value) => {
        this.store.set(key, { value, expires: Date.now() + this.ttlMs })
        return value
      })
      .finally(() => this.inflight.delete(key))
    this.inflight.set(key, p)
    return p
  }
}
