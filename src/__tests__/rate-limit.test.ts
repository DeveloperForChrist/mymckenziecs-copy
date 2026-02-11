import { describe, it, expect } from 'vitest';
import { rateLimit, getIdentifier } from '@/lib/utils/rate-limit';

describe('Rate Limiting', () => {
  describe('getIdentifier', () => {
    it('should use userId if provided', () => {
      const result = getIdentifier('user123', '192.168.1.1');
      expect(result).toBe('user123');
    });

    it('should fallback to IP if userId is not provided', () => {
      const result = getIdentifier(undefined, '192.168.1.1');
      expect(result).toBe('192.168.1.1');
    });

    it('should fallback to "anonymous" if neither is provided', () => {
      const result = getIdentifier(undefined, undefined);
      expect(result).toBe('anonymous');
    });
  });

  describe('rateLimit (in-memory fallback)', () => {
    it('should allow requests within limit', async () => {
      const result = await rateLimit(null, 'test-user', 5, 60000);
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(4);
    });

    it('should reject requests exceeding limit', async () => {
      const identifier = 'test-user-limit';
      
      // Make 5 requests (the limit)
      for (let i = 0; i < 5; i++) {
        await rateLimit(null, identifier, 5, 60000);
      }

      // 6th request should be rejected
      const result = await rateLimit(null, identifier, 5, 60000);
      expect(result.success).toBe(false);
      expect(result.remaining).toBe(0);
    });
  });
});
