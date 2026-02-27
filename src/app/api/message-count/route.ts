import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/database/supabase-server';
import { createSupabaseRouteClient } from '@/lib/database/supabase-route';

const GUEST_COOKIE_NAME = 'mm_guest_id';
const AUTH_MESSAGE_LIMIT_24H = 25;
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

    // Guest identity (cookie-based) for optional guest usage metrics.
    const guestCookie = request.cookies.get(GUEST_COOKIE_NAME)?.value || null;
    const guestId = guestCookie && uuidRegex.test(guestCookie) ? guestCookie : null;

    // Support conversation-, case- or user-based queries. If none provided, return 0.
    let count = 0;

    // Conversation-level count (highest priority)
    if (conversationId) {
      // Only allow conversation/case level stats for authenticated users.
      if (!authUserId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      const { count: c } = await supabaseAdmin
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'user')
        .eq('case_id', caseId);
      count = c || 0;
    } else if (authUserId) {
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
        if (count >= AUTH_MESSAGE_LIMIT_24H && messages && messages.length > 0) {
          const oldestMessageTime = new Date(messages[0].timestamp);
          const canMessageAgainAt = new Date(oldestMessageTime.getTime() + 24 * 60 * 60 * 1000);
          return NextResponse.json(
            { count, limit: AUTH_MESSAGE_LIMIT_24H, canMessageAgainAt: canMessageAgainAt.toISOString() },
            { status: 200 }
          );
        }
      }
      return NextResponse.json({ count, limit: AUTH_MESSAGE_LIMIT_24H }, { status: 200 });
    } else if (guestId) {
      const { data: guestRow } = await supabaseAdmin
        .from('guest_message_usage')
        .select('message_count')
        .eq('guest_id', guestId)
        .maybeSingle();

      const count = typeof guestRow?.message_count === 'number' ? guestRow.message_count : 0;
      return NextResponse.json({ count, guest: true }, { status: 200 });
    }

    // No auth and no guest cookie: return zero.
    return NextResponse.json({ count: 0 }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch message count';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
