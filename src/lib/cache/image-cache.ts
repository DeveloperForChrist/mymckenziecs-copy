// Image cache for frequently requested legal concepts
interface CachedImage {
  url: string;
  prompt: string;
  concept: string;
  createdAt: number;
  accessCount: number;
}

class ImageCache {
  private cache = new Map<string, CachedImage>();
  private maxAge = 24 * 60 * 60 * 1000; // 24 hours
  private maxCacheSize = 100;
  private storageKey = 'mymckenzie:imageCache:v1';

  constructor() {
    this.hydrate();
  }

  private isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  }

  private hydrate(): void {
    if (!this.isBrowser()) return;
    try {
      const raw = window.localStorage.getItem(this.storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { items?: CachedImage[] };
      const items = Array.isArray(parsed?.items) ? parsed.items : [];
      const now = Date.now();
      items.forEach((item) => {
        if (!item?.concept) return;
        if (typeof item.createdAt !== 'number') return;
        if (now - item.createdAt >= this.maxAge) return;
        this.cache.set(item.concept.toLowerCase(), item);
      });
    } catch {
      return;
    }
  }

  private persist(): void {
    if (!this.isBrowser()) return;
    try {
      const items = Array.from(this.cache.values());
      window.localStorage.setItem(this.storageKey, JSON.stringify({ items }));
    } catch {
      return;
    }
  }

  private purgeExpired(): void {
    const now = Date.now();
    let changed = false;
    for (const [k, v] of this.cache.entries()) {
      if (now - v.createdAt >= this.maxAge) {
        this.cache.delete(k);
        changed = true;
      }
    }
    if (changed) this.persist();
  }

  get(concept: string): CachedImage | null {
    this.purgeExpired();
    const cached = this.cache.get(concept.toLowerCase());
    if (cached && Date.now() - cached.createdAt < this.maxAge) {
      cached.accessCount++;
      this.persist();
      return cached;
    }
    if (cached) {
      this.cache.delete(concept.toLowerCase());
      this.persist();
    }
    return null;
  }

  set(concept: string, prompt: string, url: string): void {
    this.purgeExpired();
    const key = concept.toLowerCase();
    
    // Remove oldest if cache is full
    if (this.cache.size >= this.maxCacheSize) {
      let oldestKey = '';
      let oldestTime = Date.now();
      
      for (const [k, v] of this.cache.entries()) {
        if (v.createdAt < oldestTime) {
          oldestTime = v.createdAt;
          oldestKey = k;
        }
      }
      
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      url,
      prompt,
      concept,
      createdAt: Date.now(),
      accessCount: 1
    });

    this.persist();
  }

  getStats(): { size: number; mostAccessed: string[] } {
    const sorted = Array.from(this.cache.entries())
      .sort((a, b) => b[1].accessCount - a[1].accessCount)
      .slice(0, 5)
      .map(([concept]) => concept);
    
    return {
      size: this.cache.size,
      mostAccessed: sorted
    };
  }
}

export const imageCache = new ImageCache();
