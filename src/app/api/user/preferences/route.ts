import { NextResponse } from 'next/server';
import { createSupabaseRouteClient } from '@/lib/database/supabase-route';
import { supabaseAdmin } from '@/lib/database/supabase-server';
import { getOrSyncUserEntitlementSnapshot } from '@/lib/payments/entitlements';
import { hasReminderAccess } from '@/lib/plans/access';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const MEETING_REMINDER_OPTIONS = new Set([15, 30, 60, 180, 1440]);

function parseReminderMinutes(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.trunc(parsed);
  return MEETING_REMINDER_OPTIONS.has(rounded) ? rounded : null;
}

async function requireReminderPlan(userId: string) {
  const snapshot = await getOrSyncUserEntitlementSnapshot(userId);
  const isEligible = hasReminderAccess(snapshot?.plan_type || '');

  return isEligible;
}

export async function GET() {
  try {
    const supabase = await createSupabaseRouteClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = data.user.id;
    const isEligible = await requireReminderPlan(userId);
    if (!isEligible) {
      return NextResponse.json({ error: 'Premium plan required' }, { status: 403 });
    }

    const { data: prefs } = await supabaseAdmin
      .from('user_preferences')
      .select('email_notifications, deadline_reminders, meeting_reminder_minutes')
      .eq('user_id', userId)
      .maybeSingle();

    return NextResponse.json({
      email_notifications: prefs?.email_notifications !== false,
      deadline_reminders: prefs?.deadline_reminders === true,
      meeting_reminder_minutes: parseReminderMinutes(prefs?.meeting_reminder_minutes) || 1440,
    });
  } catch (error: any) {
    console.error('Preferences GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const supabase = await createSupabaseRouteClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = data.user.id;
    const isEligible = await requireReminderPlan(userId);
    if (!isEligible) {
      return NextResponse.json({ error: 'Premium plan required' }, { status: 403 });
    }

    const body = await request.json();
    const deadlineReminders = body?.deadline_reminders;
    const meetingReminderMinutes = body?.meeting_reminder_minutes;
    const parsedReminderMinutes =
      meetingReminderMinutes === undefined ? null : parseReminderMinutes(meetingReminderMinutes);

    if (typeof deadlineReminders !== 'boolean' && parsedReminderMinutes === null) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const { data: existing } = await supabaseAdmin
      .from('user_preferences')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (existing?.user_id) {
      const payload: Record<string, unknown> = {}
      if (typeof deadlineReminders === 'boolean') payload.deadline_reminders = deadlineReminders
      if (parsedReminderMinutes !== null) payload.meeting_reminder_minutes = parsedReminderMinutes
      await supabaseAdmin
        .from('user_preferences')
        .update(payload)
        .eq('user_id', userId);
    } else {
      await supabaseAdmin
        .from('user_preferences')
        .insert({
          user_id: userId,
          email_notifications: true,
          deadline_reminders: typeof deadlineReminders === 'boolean' ? deadlineReminders : true,
          meeting_reminder_minutes: parsedReminderMinutes || 1440,
        });
    }

    return NextResponse.json({
      ok: true,
      deadline_reminders: typeof deadlineReminders === 'boolean' ? deadlineReminders : true,
      meeting_reminder_minutes: parsedReminderMinutes || 1440,
    });
  } catch (error: any) {
    console.error('Preferences PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
