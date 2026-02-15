import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/database/supabase-server';
import { createSupabaseRouteClient } from '@/lib/database/supabase-route';

const GUEST_COOKIE_NAME = 'mm_guest_id';
const GUEST_MESSAGE_LIMIT_24H = 5;
const FREE_USER_MESSAGE_LIMIT_24H = 20;
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const caseId = searchParams.get('caseId');
    const conversationId = searchParams.get('conversationId');

    // Prefer authenticated identity (server-truth) over any client-supplied userId.
    const supabase = await createSupabaseRouteClient();
    const { data: authData } = await supabase.auth.getUser();
    const authUserId = authData?.user?.id || null;

    // Guest identity (cookie-based) for guest message limit display/enforcement.
    const guestCookie = request.cookies.get(GUEST_COOKIE_NAME)?.value || null;
    const guestId = guestCookie && uuidRegex.test(guestCookie) ? guestCookie : null;

    // Support conversation-, case- or user-based queries. If none provided, return 0.
    let count = 0;

    // Conversation-level count (highest priority)
    if (conversationId) {
      // Only allow conversation/case level stats for authenticated users.
      if (!authUserId) {
        return NextResponse.json({ count: 0 }, { status: 200 });
      }
      const { count: c } = await supabaseAdmin
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'user')
        .eq('conversation_id', conversationId);
      count = c || 0;
    } else if (caseId) {
      // Case-level count
      if (!authUserId) {
        return NextResponse.json({ count: 0 }, { status: 200 });
      }
      const { count: c } = await supabaseAdmin
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'user')
        .eq('case_id', caseId);
      count = c || 0;
    } else if (authUserId) {
      const { data: activeSub } = await supabaseAdmin
        .from('subscriptions')
        .select('plan_type, status')
        .eq('user_id', authUserId)
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
          .eq('id', authUserId)
          .maybeSingle();

        const count = typeof userRow?.freemium_message_count === 'number' ? userRow.freemium_message_count : 0;
        const windowStart = userRow?.freemium_message_window_start ? new Date(userRow.freemium_message_window_start) : null;
        if (count >= FREE_USER_MESSAGE_LIMIT_24H && windowStart) {
          const canMessageAgainAt = new Date(windowStart.getTime() + 24 * 60 * 60 * 1000);
          return NextResponse.json(
            { count, limit: FREE_USER_MESSAGE_LIMIT_24H, canMessageAgainAt: canMessageAgainAt.toISOString() },
            { status: 200 }
          );
        }
        return NextResponse.json({ count, limit: FREE_USER_MESSAGE_LIMIT_24H }, { status: 200 });
      }

      const twentyFourHoursAgo = new Date();
      twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
      
      const { data: userRow } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('id', authUserId)
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
        if (count >= FREE_USER_MESSAGE_LIMIT_24H && messages && messages.length > 0) {
          const oldestMessageTime = new Date(messages[0].timestamp);
          const canMessageAgainAt = new Date(oldestMessageTime.getTime() + 24 * 60 * 60 * 1000);
          return NextResponse.json(
            { count, limit: FREE_USER_MESSAGE_LIMIT_24H, canMessageAgainAt: canMessageAgainAt.toISOString() },
            { status: 200 }
          );
        }
      }
      return NextResponse.json({ count, limit: FREE_USER_MESSAGE_LIMIT_24H }, { status: 200 });
    } else if (guestId) {
      const { data: guestRow } = await supabaseAdmin
        .from('guest_message_usage')
        .select('message_count, window_start')
        .eq('guest_id', guestId)
        .maybeSingle();

      const count = typeof guestRow?.message_count === 'number' ? guestRow.message_count : 0;
      const windowStart = guestRow?.window_start ? new Date(guestRow.window_start) : null;
      if (count >= GUEST_MESSAGE_LIMIT_24H && windowStart) {
        const canMessageAgainAt = new Date(windowStart.getTime() + 24 * 60 * 60 * 1000);
        return NextResponse.json(
          { count, limit: GUEST_MESSAGE_LIMIT_24H, canMessageAgainAt: canMessageAgainAt.toISOString(), guest: true },
          { status: 200 }
        );
      }
      return NextResponse.json({ count, limit: GUEST_MESSAGE_LIMIT_24H, guest: true }, { status: 200 });
    }

    // No auth and no guest cookie: return zero.
    return NextResponse.json({ count: 0 }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch message count';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
