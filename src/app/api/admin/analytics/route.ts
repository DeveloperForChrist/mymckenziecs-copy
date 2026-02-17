import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/database/supabase-server';
import { requireAdminSession } from '@/lib/auth/admin-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';


export async function GET(request: Request) {
  try {
    const admin = await requireAdminSession();
    if (!admin.ok) return admin.response;

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'week'; // day, week, month

    // Calculate date ranges
    const now = new Date();
    const startDate = new Date();
    
    switch (period) {
      case 'day':
        startDate.setDate(now.getDate() - 1);
        break;
      case 'week':
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(now.getMonth() - 1);
        break;
    }

    const startIso = startDate.toISOString();

    // Users counts
    const { count: totalUsers, error: usersErr } = await supabaseAdmin
      .from('users')
      .select('*', { count: 'exact', head: true });
    if (usersErr) throw usersErr;

    const { count: newUsers, error: newUsersErr } = await supabaseAdmin
      .from('users')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startIso);
    if (newUsersErr) throw newUsersErr;

    // Active users: distinct users with cases touched in period
    const { data: activeUserIds, error: activeErr } = await supabaseAdmin
      .from('cases')
      .select('user_id')
      .gte('last_accessed', startIso);
    if (activeErr) throw activeErr;
    const activeUsers = new Set((activeUserIds || []).map((r) => r.user_id)).size;

    // Premium users: users with active subscription
    const { count: premiumUsers, error: premiumErr } = await supabaseAdmin
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');
    if (premiumErr) throw premiumErr;

    // Messages in period
    const { count: totalMessages, error: messagesErr } = await supabaseAdmin
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .gte('timestamp', startIso);
    if (messagesErr) throw messagesErr;

    // Documents in period
    const { count: totalDocuments, error: docsErr } = await supabaseAdmin
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startIso);
    if (docsErr) throw docsErr;

    // Growth rate vs previous period
    const previousPeriodStart = new Date(startDate);
    previousPeriodStart.setTime(previousPeriodStart.getTime() - (now.getTime() - startDate.getTime()));
    const prevIso = previousPeriodStart.toISOString();

    const { count: previousNewUsers, error: prevErr } = await supabaseAdmin
      .from('users')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', prevIso)
      .lt('created_at', startIso);
    if (prevErr) throw prevErr;

    const growthRate = previousNewUsers && previousNewUsers > 0
      ? parseFloat((((newUsers || 0) - previousNewUsers) / previousNewUsers * 100).toFixed(1))
      : 0;

    return NextResponse.json({
      overview: {
        totalUsers,
        newUsers,
        activeUsers,
        premiumUsers,
        totalMessages,
        totalDocuments,
        growthRate
      },
      period
    });
  } catch (error: unknown) {
    console.error('Error fetching analytics:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch analytics';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
