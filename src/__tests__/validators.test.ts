import { describe, it, expect } from 'vitest';
import { chatMessageSchema, analyzeDocumentSchema, caseLawSearchSchema } from '@/validators/index';

describe('Validation Schemas', () => {
  describe('chatMessageSchema', () => {
    it('should validate a valid chat message', () => {
      const validMessage = {
        message: 'What are my legal rights?',
        mode: 'legal-advisor',
      };

      const result = chatMessageSchema.safeParse(validMessage);
      if (!result.success) {
        console.log('Validation errors:', result.error.issues);
      }
      expect(result.success).toBe(true);
    });

    it('should reject empty message', () => {
      const invalidMessage = {
        message: '',
      };

      const result = chatMessageSchema.safeParse(invalidMessage);
      expect(result.success).toBe(false);
    });

    it('should reject message that is too long', () => {
      const invalidMessage = {
        message: 'a'.repeat(5001),
      };

      const result = chatMessageSchema.safeParse(invalidMessage);
      expect(result.success).toBe(false);
    });
  });

  describe('analyzeDocumentSchema', () => {
    it('should validate a valid document analysis request', () => {
      const validRequest = {
        content: 'This is a legal document with sufficient content.',
        fileName: 'contract.pdf',
        fileType: 'pdf',
      };

      const result = analyzeDocumentSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it('should reject request with insufficient content', () => {
      const invalidRequest = {
        content: 'short',
        fileName: 'doc.pdf',
      };

      const result = analyzeDocumentSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });
  });

  describe('caseLawSearchSchema', () => {
    it('should validate a valid search query', () => {
      const validQuery = {
        query: 'breach of contract',
        limit: 10,
      };

      const result = caseLawSearchSchema.safeParse(validQuery);
      expect(result.success).toBe(true);
    });

    it('should reject query that is too short', () => {
      const invalidQuery = {
        query: 'ab',
      };

      const result = caseLawSearchSchema.safeParse(invalidQuery);
      expect(result.success).toBe(false);
    });

    it('should enforce limit constraints', () => {
      const invalidQuery = {
        query: 'breach of contract',
        limit: 101,
      };

      const result = caseLawSearchSchema.safeParse(invalidQuery);
      expect(result.success).toBe(false);
    });
  });
});
