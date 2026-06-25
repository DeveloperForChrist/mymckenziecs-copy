import { NextResponse } from 'next/server';
import { createSupabaseRouteClient } from '@/lib/database/supabase-route';
import { supabaseAdmin } from '@/lib/database/supabase-server';
import { getOrSyncUserEntitlementSnapshot } from '@/lib/payments/entitlements';
import { hasReminderAccess } from '@/lib/plans/access';
import { enforceIpRateLimit } from '@/lib/utils/rate-limit';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const MEETING_REMINDER_OPTIONS = new Set([15, 30, 60, 180, 1440]);
const THEME_OPTIONS = new Set(['light', 'dark']);

function parseReminderMinutes(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.trunc(parsed);
  return MEETING_REMINDER_OPTIONS.has(rounded) ? rounded : null;
}

function parseTheme(value: unknown): 'light' | 'dark' | null {
  const normalized = String(value || '').trim().toLowerCase();
  return THEME_OPTIONS.has(normalized) ? (normalized as 'light' | 'dark') : null;
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

    const { data: prefs } = await supabaseAdmin
      .from('user_preferences')
      .select('email_notifications, deadline_reminders, meeting_reminder_minutes, theme')
      .eq('user_id', userId)
      .maybeSingle();

    return NextResponse.json({
      email_notifications: isEligible ? prefs?.email_notifications !== false : true,
      deadline_reminders: isEligible ? prefs?.deadline_reminders === true : false,
      meeting_reminder_minutes: isEligible ? parseReminderMinutes(prefs?.meeting_reminder_minutes) || 1440 : 1440,
      theme: parseTheme(prefs?.theme) || 'light',
      has_reminder_access: isEligible,
    });
  } catch (error: any) {
    console.error('Preferences GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const limited = await enforceIpRateLimit(request.headers, {
      key: 'user:preferences:update',
      tokens: 60,
      windowMs: 10 * 60 * 1000,
    });
    if (limited) return limited;

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
    const parsedTheme = body?.theme === undefined ? null : parseTheme(body?.theme);
    const parsedReminderMinutes =
      meetingReminderMinutes === undefined ? null : parseReminderMinutes(meetingReminderMinutes);
    const wantsReminderChange =
      typeof deadlineReminders === 'boolean' || meetingReminderMinutes !== undefined;
    const wantsThemeChange = body?.theme !== undefined;

    if ((wantsThemeChange && parsedTheme === null) || (!wantsReminderChange && !wantsThemeChange)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const reminderEligible = wantsReminderChange ? await requireReminderPlan(userId) : false;
    if (wantsReminderChange && !reminderEligible) {
      return NextResponse.json({ error: 'Premium plan required' }, { status: 403 });
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
      if (parsedTheme) payload.theme = parsedTheme
      await supabaseAdmin
        .from('user_preferences')
        .update(payload)
        .eq('user_id', userId);
    } else {
      const payload: Record<string, unknown> = {
        user_id: userId,
      }
      if (parsedTheme) payload.theme = parsedTheme
      if (typeof deadlineReminders === 'boolean') payload.deadline_reminders = deadlineReminders
      if (parsedReminderMinutes !== null) payload.meeting_reminder_minutes = parsedReminderMinutes
      await supabaseAdmin
        .from('user_preferences')
        .insert(payload);
    }

    return NextResponse.json({
      ok: true,
      deadline_reminders: typeof deadlineReminders === 'boolean' ? deadlineReminders : undefined,
      meeting_reminder_minutes: parsedReminderMinutes ?? undefined,
      theme: parsedTheme ?? undefined,
      has_reminder_access: wantsReminderChange ? reminderEligible : undefined,
    });
  } catch (error: any) {
    console.error('Preferences PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
