export interface Cache<K, V> {
  get(key: K): Promise<V | undefined>;
  set(key: K, value: V, ttlMs?: number): Promise<void>;
  has(key: K): Promise<boolean>;
  delete(key: K): Promise<void>;
  clear(): Promise<void>;
}
