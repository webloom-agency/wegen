import { Cache } from "./cache.interface";

type Entry<V> = { value: V; expiresAt: number };
interface MemoryCacheOptions {
  defaultTtlMs?: number;
  cleanupIntervalMs?: number;
}

export class MemoryCache<K, V> implements Cache<K, V> {
  private store = new Map<K, Entry<V>>();
  private defaultTtlMs: number;
  constructor(opts: MemoryCacheOptions = {}) {
    this.defaultTtlMs = opts.defaultTtlMs ?? Infinity;
    const interval = opts.cleanupIntervalMs ?? 60_000;
    if (isFinite(interval) && interval > 0) {
      setInterval(() => this.sweep(), interval).unref();
    }
  }

  async get(key: K) {
    const e = this.store.get(key);
    if (!e) return undefined;
    if (Date.now() > e.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return e.value;
  }

  async set(key: K, value: V, ttlMs = this.defaultTtlMs) {
    const expiresAt = isFinite(ttlMs) ? Date.now() + ttlMs : Infinity;
    this.store.set(key, { value, expiresAt });
  }

  async has(key: K) {
    return (await this.get(key)) !== undefined;
  }
  async delete(key: K) {
    this.store.delete(key);
  }
  async clear() {
    this.store.clear();
  }

  private sweep() {
    const now = Date.now();
    for (const [k, { expiresAt }] of this.store)
      if (now > expiresAt) this.store.delete(k);
  }
}
