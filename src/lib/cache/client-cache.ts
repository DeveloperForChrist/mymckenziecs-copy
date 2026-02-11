type CacheEntry<T> = {
  value?: T;
  expiresAt: number;
  promise?: Promise<T>;
};

const cache = new Map<string, CacheEntry<unknown>>();

export function peekCachedJson<T>(key: string): T | null {
  const now = Date.now();
  const existing = cache.get(key) as CacheEntry<T> | undefined;
  if (!existing?.value) return null;
  if (now >= existing.expiresAt) return null;
  return existing.value;
}

export function setCachedJson<T>(key: string, value: T, ttlMs: number): void {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export async function getCachedJson<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const existing = cache.get(key) as CacheEntry<T> | undefined;

  if (existing?.value !== undefined && now < existing.expiresAt) {
    return existing.value;
  }

  if (existing?.promise) {
    return existing.promise;
  }

  const promise = fetcher()
    .then((value) => {
      cache.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    })
    .catch((error) => {
      if (existing?.value !== undefined) {
        cache.set(key, { value: existing.value, expiresAt: Date.now() + Math.min(ttlMs, 5000) });
        return existing.value;
      }
      cache.delete(key);
      throw error;
    });

  cache.set(key, { value: existing?.value, expiresAt: existing?.expiresAt ?? 0, promise });
  return promise;
}
