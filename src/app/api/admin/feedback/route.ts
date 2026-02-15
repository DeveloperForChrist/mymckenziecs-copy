import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/database/supabase-server';
import { requireAdminSession } from '@/lib/auth/admin-guard';

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


export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, conversationId, messageIndex, feedbackType, messageContent, timestamp, reportIssue, reportProblem } = body;

    // Store feedback in audit_log table (or a dedicated feedback table if exists)
    const { error } = await supabaseAdmin
      .from('audit_log')
      .insert({
        action: `feedback_${feedbackType}`,
        details: JSON.stringify({
          userId,
          conversationId,
          messageIndex,
          feedbackType,
          messageContent,
          timestamp,
          reportIssue,
          reportProblem
        })
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
    const admin = requireAdminSession();
    if (!admin.ok) return admin.response;

    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type');
    const limit = parseInt(searchParams.get('limit') || '100');

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
