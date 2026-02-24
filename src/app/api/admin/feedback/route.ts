import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/database/supabase-server';
import { requireAdminSession } from '@/lib/auth/admin-guard';
import { createSupabaseRouteClient } from '@/lib/database/supabase-route';
import { apiRateLimiter, getClientIp, getIdentifier, rateLimit, rateLimitExceededResponse } from '@/lib/utils/rate-limit';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type FeedbackLogRow = {
  id: string
  details?: unknown
  created_at?: string | null
}

type FeedbackItem = {
  id: string
  feedbackType?: string
  createdAt?: string | null
  [key: string]: unknown
}

const feedbackPayloadSchema = z
  .object({
    conversationId: z.string().max(160).optional(),
    messageIndex: z.number().int().min(0).max(100000).nullable().optional(),
    feedbackType: z.enum(['like', 'dislike', 'report']),
    messageContent: z.string().min(1).max(5000),
    timestamp: z.string().optional(),
    reportIssue: z.string().max(240).optional(),
    reportProblem: z.string().max(2000).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.feedbackType === 'report') {
      if (!value.reportIssue || value.reportIssue.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['reportIssue'],
          message: 'reportIssue is required for report feedback',
        });
      }
      if (!value.reportProblem || value.reportProblem.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['reportProblem'],
          message: 'reportProblem is required for report feedback',
        });
      }
    }
  });


export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const ip = getClientIp(request.headers);
    const identifier = `feedback:${getIdentifier(authData.user.id, ip)}`;
    const limit = await rateLimit(apiRateLimiter, identifier, 12, 60 * 1000);
    if (!limit.success) {
      return rateLimitExceededResponse(limit, 'Too many feedback submissions. Please try again later.');
    }

    const parsed = feedbackPayloadSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid feedback payload', details: parsed.error.issues }, { status: 400 });
    }

    const {
      conversationId,
      messageIndex,
      feedbackType,
      messageContent,
      timestamp,
      reportIssue,
      reportProblem,
    } = parsed.data;

    // Store feedback in audit_log table (or a dedicated feedback table if exists)
    const { error } = await supabaseAdmin
      .from('audit_log')
      .insert({
        action: `feedback_${feedbackType}`,
        details: {
          userId: authData.user.id,
          conversationId,
          messageIndex: messageIndex ?? null,
          feedbackType,
          messageContent,
          timestamp: timestamp || new Date().toISOString(),
          reportIssue: reportIssue || null,
          reportProblem: reportProblem || null,
        },
      });

    if (error) {
      console.error('Error submitting feedback:', error);
      return NextResponse.json(
        { error: 'Failed to submit feedback', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      success: true,
      message: 'Feedback submitted successfully'
    });
  } catch (error: unknown) {
    console.error('Error submitting feedback:', error);
    const details = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to submit feedback', details },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminSession();
    if (!admin.ok) return admin.response;

    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type');
    const parsedLimit = Number.parseInt(searchParams.get('limit') || '100', 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 500) : 100;

    let query = supabaseAdmin
      .from('audit_log')
      .select('*')
      .like('action', 'feedback_%')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (type) {
      query = query.eq('action', `feedback_${type}`);
    }

    const { data: feedbackData, error } = await query;

    if (error) {
      console.error('Error fetching feedback:', error);
      return NextResponse.json(
        { error: 'Failed to fetch feedback', details: error.message },
        { status: 500 }
      );
    }

    const feedback: FeedbackItem[] = (feedbackData || []).map((f: FeedbackLogRow) => {
      const details = typeof f.details === 'string' ? JSON.parse(f.details) : (f.details || {});
      return {
        id: f.id,
        ...(typeof details === 'object' && details !== null ? details : {}),
        createdAt: f.created_at
      };
    });

    // Count by type
    const counts = {
      likes: feedback.filter((f) => f.feedbackType === 'like').length,
      dislikes: feedback.filter((f) => f.feedbackType === 'dislike').length,
      reports: feedback.filter((f) => f.feedbackType === 'report').length,
      total: feedback.length
    };

    return NextResponse.json({
      feedback,
      counts,
      total: feedback.length
    });
  } catch (error: unknown) {
    console.error('Error fetching feedback:', error);
    const details = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to fetch feedback', details },
      { status: 500 }
    );
  }
}
