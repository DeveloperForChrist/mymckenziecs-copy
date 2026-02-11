import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/database/supabase-server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const caseId = searchParams.get('caseId');
    const conversationId = searchParams.get('conversationId');
    let userId = searchParams.get('userId');
    
    // Normalize anon_ prefixed user ids (anon_<uuid>) to the raw uuid for DB queries
    if (userId && typeof userId === 'string' && userId.startsWith('anon_')) {
      const maybe = userId.slice(5);
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(maybe)) {
        userId = maybe;
      }
    }

    // Support conversation-, case- or user-based queries. If none provided, return 0.
    let count = 0;

    // Conversation-level count (highest priority)
    if (conversationId) {
      const { count: c } = await supabaseAdmin
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'user')
        .eq('conversation_id', conversationId);
      count = c || 0;
    } else if (caseId) {
      // Case-level count
      const { count: c } = await supabaseAdmin
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'user')
        .eq('case_id', caseId);
      count = c || 0;
    } else if (userId) {
      const { data: activeSub } = await supabaseAdmin
        .from('subscriptions')
        .select('plan_type, status')
        .eq('user_id', userId)
        .in('status', ['active', 'past_due'])
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const planLabel = (activeSub?.plan_type || '').toString().toLowerCase();
      const isPaid =
        planLabel.includes('standard') ||
        planLabel.includes('essential') ||
        planLabel.includes('plus') ||
        planLabel.includes('premium') ||
        planLabel.includes('pro');

      if (!isPaid) {
        const { data: userRow } = await supabaseAdmin
          .from('users')
          .select('freemium_message_count, freemium_message_window_start')
          .eq('id', userId)
          .maybeSingle();

        const count = typeof userRow?.freemium_message_count === 'number' ? userRow.freemium_message_count : 0;
        const windowStart = userRow?.freemium_message_window_start ? new Date(userRow.freemium_message_window_start) : null;
        if (count >= 20 && windowStart) {
          const canMessageAgainAt = new Date(windowStart.getTime() + 24 * 60 * 60 * 1000);
          return NextResponse.json({ count, canMessageAgainAt: canMessageAgainAt.toISOString() }, { status: 200 });
        }
        return NextResponse.json({ count }, { status: 200 });
      }

      const twentyFourHoursAgo = new Date();
      twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
      
      const { data: userRow } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('id', userId)
        .maybeSingle();

      if (userRow) {
        // Count messages in last 24 hours across all cases + null case_id
        const { data: messages, count: c } = await supabaseAdmin
          .from('messages')
          .select('timestamp', { count: 'exact' })
          .eq('role', 'user')
          .gte('timestamp', twentyFourHoursAgo.toISOString())
          .or(`case_id.is.null,case_id.in.(select id from cases where user_id.eq.${userRow.id})`)
          .order('timestamp', { ascending: true })
          .limit(1);
        
        count = c || 0;
        
        // If at limit, return when they can message again (oldest message + 24h)
        if (count >= 20 && messages && messages.length > 0) {
          const oldestMessageTime = new Date(messages[0].timestamp);
          const canMessageAgainAt = new Date(oldestMessageTime.getTime() + 24 * 60 * 60 * 1000);
          return NextResponse.json({ count, canMessageAgainAt: canMessageAgainAt.toISOString() }, { status: 200 });
        }
      }
    } else {
      // No context provided; return zero instead of error so clients can safely call without case context
      count = 0;
    }

    return NextResponse.json({ count }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch message count';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
