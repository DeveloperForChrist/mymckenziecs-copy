import { NextResponse } from 'next/server';
import { createSupabaseRouteClient } from '@/lib/database/supabase-route';
import { supabaseAdmin } from '@/lib/database/supabase-server';

async function requirePaidPlan(userId: string) {
  const { data: activeSub } = await supabaseAdmin
    .from('subscriptions')
    .select('plan_type, status')
    .eq('user_id', userId)
    .in('status', ['active', 'past_due', 'trialing'])
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

  return isPaid;
}

export async function GET() {
  try {
    const supabase = await createSupabaseRouteClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = data.user.id;
    const isPaid = await requirePaidPlan(userId);
    if (!isPaid) {
      return NextResponse.json({ error: 'Paid plan required' }, { status: 403 });
    }

    const { data: prefs } = await supabaseAdmin
      .from('user_preferences')
      .select('email_notifications, deadline_reminders')
      .eq('user_id', userId)
      .maybeSingle();

    return NextResponse.json({
      email_notifications: prefs?.email_notifications !== false,
      deadline_reminders: prefs?.deadline_reminders !== false,
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
    const isPaid = await requirePaidPlan(userId);
    if (!isPaid) {
      return NextResponse.json({ error: 'Paid plan required' }, { status: 403 });
    }

    const body = await request.json();
    const deadlineReminders = body?.deadline_reminders;
    if (typeof deadlineReminders !== 'boolean') {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const { data: existing } = await supabaseAdmin
      .from('user_preferences')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (existing?.user_id) {
      await supabaseAdmin
        .from('user_preferences')
        .update({ deadline_reminders: deadlineReminders })
        .eq('user_id', userId);
    } else {
      await supabaseAdmin
        .from('user_preferences')
        .insert({
          user_id: userId,
          email_notifications: true,
          deadline_reminders: deadlineReminders,
        });
    }

    return NextResponse.json({ ok: true, deadline_reminders: deadlineReminders });
  } catch (error: any) {
    console.error('Preferences PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
