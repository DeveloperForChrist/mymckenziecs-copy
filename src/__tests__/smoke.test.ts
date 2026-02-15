import { describe, it, expect } from 'vitest';

describe('Smoke Tests', () => {
  describe('Environment Variables', () => {
    it('should have required Supabase environment variables', () => {
      expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBeDefined();
      expect(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBeDefined();
    });

    it('should have required OpenAI environment variable', () => {
      expect(process.env.OPENAI_API_KEY).toBeDefined();
    });

    it('should have required Stripe environment variables', () => {
      expect(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY).toBeDefined();
      expect(process.env.STRIPE_SECRET_KEY).toBeDefined();
    });
  });

  describe('Basic Math', () => {
    it('should perform basic arithmetic', () => {
      expect(1 + 1).toBe(2);
      expect(10 - 5).toBe(5);
      expect(3 * 4).toBe(12);
    });
  });

  // Skip API route tests as they require full environment setup
  describe.skip('API Route Exports', () => {
    it('should have chat API route', async () => {
      const chatModule = await import('@/app/api/chat/route');
      expect(chatModule.POST).toBeDefined();
      expect(typeof chatModule.POST).toBe('function');
    });

    it('should have search-case-law API route', async () => {
      const searchModule = await import('@/app/api/search-case-law/route');
      expect(searchModule.POST).toBeDefined();
      expect(typeof searchModule.POST).toBe('function');
    });
  });
});
