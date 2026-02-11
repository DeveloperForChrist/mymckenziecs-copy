/**
 * In-memory cache for case studies with TTL (Time To Live)
 * This helps avoid regenerating the same case studies repeatedly
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

interface CaseStudyCache {
  content: string;
  metadata: any;
}

export class CaseStudyCacheManager {
  private cache: Map<string, CacheEntry<CaseStudyCache>>;
  private readonly defaultTTL: number; // milliseconds
  private readonly maxCacheSize: number;

  constructor(ttlMinutes: number = 60, maxSize: number = 100) {
    this.cache = new Map();
    this.defaultTTL = ttlMinutes * 60 * 1000;
    this.maxCacheSize = maxSize;
  }

  /**
   * Generate a cache key from case data
   */
  private generateKey(title: string, citation: string): string {
    const normalized = `${title.toLowerCase().trim()}_${citation.toLowerCase().trim()}`;
    return Buffer.from(normalized).toString('base64').substring(0, 64);
  }

  /**
   * Get cached case study if available and not expired
   */
  get(title: string, citation: string): CaseStudyCache | null {
    const key = this.generateKey(title, citation);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    console.log('✅ Cache hit for case study:', title);
    return entry.data;
  }

  /**
   * Store case study in cache
   */
  set(
    title: string, 
    citation: string, 
    data: CaseStudyCache, 
    ttlMinutes?: number
  ): void {
    const key = this.generateKey(title, citation);
    const ttl = ttlMinutes ? ttlMinutes * 60 * 1000 : this.defaultTTL;
    
    // Enforce max cache size using LRU strategy
    if (this.cache.size >= this.maxCacheSize) {
      // Find and remove oldest entry
      let oldestKey: string | null = null;
      let oldestTime = Date.now();

      for (const [k, v] of this.cache.entries()) {
        if (v.timestamp < oldestTime) {
          oldestTime = v.timestamp;
          oldestKey = k;
        }
      }

      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + ttl
    });

    console.log(`📦 Cached case study: ${title} (expires in ${ttlMinutes || this.defaultTTL / 60000} minutes)`);
  }

  /**
   * Check if a case study is in cache
   */
  has(title: string, citation: string): boolean {
    return this.get(title, citation) !== null;
  }

  /**
   * Remove a specific case study from cache
   */
  delete(title: string, citation: string): boolean {
    const key = this.generateKey(title, citation);
    return this.cache.delete(key);
  }

  /**
   * Clear all cached case studies
   */
  clear(): void {
    this.cache.clear();
    console.log('🗑️ Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    oldestEntryAge: number;
  } {
    let oldestTime = Date.now();

    for (const entry of this.cache.values()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
      }
    }

    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      hitRate: 0, // Would need to track hits/misses to calculate
      oldestEntryAge: Date.now() - oldestTime
    };
  }

  /**
   * Remove expired entries from cache
   */
  cleanup(): number {
    const now = Date.now();
    let removedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      console.log(`🧹 Cleaned up ${removedCount} expired cache entries`);
    }

    return removedCount;
  }
}

// Export singleton instance - 60 minute TTL, max 100 entries
export const caseStudyCache = new CaseStudyCacheManager(60, 100);

// Run cleanup every 10 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    caseStudyCache.cleanup();
  }, 10 * 60 * 1000);
}
