import { z } from 'zod';

/**
 * User-related validation schemas
 */
export const userProfileSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(50),
  lastName: z.string().min(1, 'Last name is required').max(50),
  email: z.string().email('Invalid email address'),
  phoneNumber: z.string().optional(),
});

export const userUpdateSchema = userProfileSchema.partial();

/**
 * Authentication validation schemas
 */
export const signInSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const signUpSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  firstName: z.string().min(1, 'First name is required').max(50),
  lastName: z.string().min(1, 'Last name is required').max(50),
});

/**
 * Case-related validation schemas
 */
export const caseCreateSchema = z.object({
  title: z.string().min(1, 'Case title is required').max(200),
  description: z.string().optional(),
  caseType: z.enum(['civil', 'criminal', 'family', 'employment', 'other']).optional(),
  status: z.enum(['active', 'closed', 'pending']).optional(),
});

export const caseUpdateSchema = caseCreateSchema.partial();

/**
 * Document validation schemas
 */
export const documentUploadSchema = z.object({
  fileName: z.string().min(1, 'File name is required'),
  fileType: z.enum(['pdf', 'docx', 'doc', 'txt']),
  fileSize: z.number().max(10 * 1024 * 1024, 'File size must be less than 10MB'),
});

/**
 * Document analysis schema - for API use
 */
export const analyzeDocumentSchema = z.object({
  content: z.string().min(10, 'Document content is too short'),
  fileName: z.string().optional(),
  fileType: z.enum(['pdf', 'docx', 'txt']).optional(),
  analysisType: z.enum(['summary', 'detailed', 'legal-review']).optional(),
});

/**
 * Case law search schema - for API use
 */
export const caseLawSearchSchema = z.object({
  query: z.string().min(3, 'Query must be at least 3 characters').max(500, 'Query too long'),
  jurisdiction: z.enum(['uk', 'england-wales', 'scotland', 'northern-ireland']).optional(),
  court: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  limit: z.number().min(1).max(100).default(10),
});

/**
 * Chat validation schemas
 */
export const chatMessageSchema = z.object({
  message: z.string().min(1, 'Message cannot be empty').max(5000, 'Message is too long'),
  caseId: z.string().uuid().optional(),
  mode: z.enum(['legal-advisor', 'document-review', 'general']).optional(),
});

/**
 * Case analysis validation schemas
 */
export const caseAnalysisSchema = z.object({
  caseId: z.string().uuid(),
  analysisType: z.enum(['strengths', 'weaknesses', 'risks', 'strategy', 'full']),
  details: z.string().optional(),
});

export const evidenceSubmissionSchema = z.object({
  caseId: z.string().uuid(),
  evidenceType: z.enum(['document', 'witness', 'physical', 'digital']),
  description: z.string().min(1, 'Description is required').max(1000),
  documentIds: z.array(z.string().uuid()).optional(),
});

/**
 * Contact form validation schema
 */
export const contactFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email address'),
  subject: z.string().min(1, 'Subject is required').max(200),
  message: z.string().min(10, 'Message must be at least 10 characters').max(2000),
});

/**
 * Draft document validation schemas
 */
export const draftCreateSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  content: z.string().optional(),
  documentType: z.enum(['letter', 'statement', 'pleading', 'contract', 'other']).optional(),
  caseId: z.string().uuid().optional(),
});

export const draftUpdateSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1, 'Title is required').max(200).optional(),
  content: z.string().optional(),
  status: z.enum(['draft', 'review', 'final']).optional(),
});

/**
 * Calendar event validation schemas
 */
export const calendarEventSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  caseId: z.string().uuid().optional(),
  eventType: z.enum(['hearing', 'deadline', 'meeting', 'reminder', 'other']).optional(),
});

export const calendarEventUpdateSchema = calendarEventSchema.partial().extend({
  id: z.string().uuid(),
});

/**
 * Type exports for TypeScript
 */
export type UserProfile = z.infer<typeof userProfileSchema>;
export type UserUpdate = z.infer<typeof userUpdateSchema>;
export type SignIn = z.infer<typeof signInSchema>;
export type SignUp = z.infer<typeof signUpSchema>;
export type CaseCreate = z.infer<typeof caseCreateSchema>;
export type CaseUpdate = z.infer<typeof caseUpdateSchema>;
export type DocumentUpload = z.infer<typeof documentUploadSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type CaseAnalysis = z.infer<typeof caseAnalysisSchema>;
export type EvidenceSubmission = z.infer<typeof evidenceSubmissionSchema>;
export type ContactForm = z.infer<typeof contactFormSchema>;
export type DraftCreate = z.infer<typeof draftCreateSchema>;
export type DraftUpdate = z.infer<typeof draftUpdateSchema>;
export type CalendarEvent = z.infer<typeof calendarEventSchema>;
export type CalendarEventUpdate = z.infer<typeof calendarEventUpdateSchema>;
