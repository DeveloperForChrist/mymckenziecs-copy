import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/database/supabase-server';
import { sendResendEmail } from '@/lib/email/resend';
import { getAppUrl } from '@/lib/app-url';
import { verifyCronSecret } from '@/lib/security/timing-safe';
import { getBillingMarketFromCountryCode } from '@/constants';
import { getPublicRouteForMarket } from '@/lib/markets/public-routes';
import {
  buildLifecycleSchedule,
  daysUntil,
  getLifecycleWarningDays,
  parseReminderDaysSet,
  serializeReminderDaysSet,
} from '@/lib/payments/subscription-lifecycle';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const TEMPLATE_DIR = path.join(process.cwd(), 'src', 'emails', 'templates');

type SubscriptionRow = {
  id: string;
  user_id: string;
  status: string;
  updated_at: string | null;
  lifecycle_lapsed_at: string | null;
  lifecycle_archive_at: string | null;
  lifecycle_delete_at: string | null;
  lifecycle_archived_at: string | null;
  lifecycle_deleted_at: string | null;
  lifecycle_archive_warning_days_sent: any;
  lifecycle_delete_warning_days_sent: any;
};

function renderTemplate(templateName: string, vars: Record<string, string>) {
  const templatePath = path.join(TEMPLATE_DIR, templateName);
  let html = fs.readFileSync(templatePath, 'utf8');
  for (const [k, v] of Object.entries(vars)) {
    html = html.split(`{{${k}}}`).join(v);
  }
  return html;
}

function formatDateLabel(value?: Date | string | number | null) {
  if (!value) return 'soon';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'soon';
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

async function archiveUserData(userId: string, nowIso: string) {
  await supabaseAdmin
    .from('cases')
    .update({ status: 'archived', updated_at: nowIso })
    .eq('user_id', userId)
    .is('deleted_at', null)
    .in('status', ['active', 'closed']);
}

async function deleteRetainedUserData(userId: string) {
  const { data: cases } = await supabaseAdmin.from('cases').select('id').eq('user_id', userId);
  const caseIds = (cases || []).map((row) => row.id).filter(Boolean);

  const docsByOwnerPromise = supabaseAdmin
    .from('documents')
    .select('id, storage_path')
    .eq('uploaded_by', userId);

  const docsByCasePromise =
    caseIds.length > 0
      ? supabaseAdmin.from('documents').select('id, storage_path').in('case_id', caseIds)
      : Promise.resolve({ data: [], error: null } as any);

  const [docsByOwner, docsByCase] = await Promise.all([docsByOwnerPromise, docsByCasePromise]);
  const docs = [...(docsByOwner.data || []), ...(docsByCase.data || [])];
  const docById = new Map<string, { id: string; storage_path: string | null }>();
  for (const doc of docs) {
    if (!doc?.id || docById.has(doc.id)) continue;
    docById.set(doc.id, doc);
  }

  const docRows = Array.from(docById.values());
  const storagePaths = docRows
    .map((doc) => String(doc.storage_path || '').trim())
    .filter((value) => value.length > 0);

  for (let i = 0; i < storagePaths.length; i += 100) {
    const batch = storagePaths.slice(i, i + 100);
    const { error: storageError } = await supabaseAdmin.storage.from('user-uploads').remove(batch);
    if (storageError) {
      console.error('Lifecycle delete storage remove failed', userId, storageError);
    }
  }

  const docIds = docRows.map((doc) => doc.id).filter(Boolean);
  if (docIds.length > 0) {
    await supabaseAdmin.from('documents').delete().in('id', docIds);
  }

  await supabaseAdmin.from('chat_action_items').delete().eq('user_id', userId);
  await supabaseAdmin.from('chat_memory').delete().eq('user_id', userId);
  await supabaseAdmin.from('calendar_events').delete().eq('user_id', userId);
  await supabaseAdmin.from('cases').delete().eq('user_id', userId);
}

export async function GET(request: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const headerSecret = request.headers.get('x-cron-secret') || request.headers.get('authorization');

    if (!verifyCronSecret(headerSecret, cronSecret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const warningDays = getLifecycleWarningDays();
    const appUrl = getAppUrl(request);
    const { data: subs, error: subsError } = await supabaseAdmin
      .from('subscriptions')
      .select(
        'id, user_id, status, updated_at, lifecycle_lapsed_at, lifecycle_archive_at, lifecycle_delete_at, lifecycle_archived_at, lifecycle_deleted_at, lifecycle_archive_warning_days_sent, lifecycle_delete_warning_days_sent'
      )
      .in('status', ['expired', 'cancelled'])
      .order('updated_at', { ascending: false });

    if (subsError) {
      console.error('Lifecycle cron failed to load subscriptions', subsError);
      return NextResponse.json({ error: 'Failed to load subscriptions' }, { status: 500 });
    }

    const latestByUser = new Map<string, SubscriptionRow>();
    for (const row of (subs || []) as SubscriptionRow[]) {
      if (!row.user_id || latestByUser.has(row.user_id)) continue;
      latestByUser.set(row.user_id, row);
    }
    const lapsedTargets = Array.from(latestByUser.values());
    if (lapsedTargets.length === 0) {
      return NextResponse.json({ ok: true, hardLockWarningsSent: 0, deleteWarningsSent: 0, archived: 0, deleted: 0 });
    }

    const latestUserIds = lapsedTargets.map((row) => row.user_id);
    const { data: latestSubs } = await supabaseAdmin
      .from('subscriptions')
      .select('id, user_id, status, updated_at')
      .in('user_id', latestUserIds)
      .order('updated_at', { ascending: false });

    const latestOverallByUser = new Map<string, { id: string; status: string }>();
    for (const row of (latestSubs || []) as Array<{ id: string; user_id: string; status: string }>) {
      if (!row.user_id || latestOverallByUser.has(row.user_id)) continue;
      latestOverallByUser.set(row.user_id, { id: row.id, status: row.status });
    }

    const targets = lapsedTargets.filter((row) => {
      const latest = latestOverallByUser.get(row.user_id);
      if (!latest) return true;
      const latestStatus = (latest.status || '').toLowerCase();
      return latest.id === row.id && (latestStatus === 'expired' || latestStatus === 'cancelled');
    });

    if (targets.length === 0) {
      return NextResponse.json({ ok: true, hardLockWarningsSent: 0, deleteWarningsSent: 0, archived: 0, deleted: 0 });
    }

    const userIds = targets.map((row) => row.user_id);
    const { data: users } = await supabaseAdmin
      .from('users')
      .select('id, email, name, country_code')
      .in('id', userIds);

    const usersById = new Map((users || []).map((row) => [row.id, row]));

    let hardLockWarningsSent = 0;
    let deleteWarningsSent = 0;
    let archived = 0;
    let deleted = 0;

    for (const sub of targets) {
      const lapsedBase = sub.lifecycle_lapsed_at || sub.updated_at || nowIso;
      const schedule = buildLifecycleSchedule(lapsedBase);
      const archiveAt = sub.lifecycle_archive_at ? new Date(sub.lifecycle_archive_at) : schedule.archiveAt;
      const deleteAt = sub.lifecycle_delete_at ? new Date(sub.lifecycle_delete_at) : schedule.deleteAt;
      const user = usersById.get(sub.user_id) as {
        email?: string;
        name?: string | null;
        country_code?: string | null;
      } | undefined;
      const resumeUrl = `${appUrl}${getPublicRouteForMarket(
        '/pricing',
        getBillingMarketFromCountryCode(user?.country_code)
      )}`;
      const archiveWarningSentDays = parseReminderDaysSet(sub.lifecycle_archive_warning_days_sent);
      const deleteWarningSentDays = parseReminderDaysSet(sub.lifecycle_delete_warning_days_sent);
      const updates: Record<string, any> = {};

      if (!sub.lifecycle_lapsed_at) updates.lifecycle_lapsed_at = schedule.lapsedAt.toISOString();
      if (!sub.lifecycle_archive_at) updates.lifecycle_archive_at = archiveAt.toISOString();
      if (!sub.lifecycle_delete_at) updates.lifecycle_delete_at = deleteAt.toISOString();

      const archiveDaysLeft = daysUntil(archiveAt, now);
      const dueArchiveWarnings =
        archiveDaysLeft === null || sub.lifecycle_archived_at
          ? []
          : warningDays.filter((day) => day === archiveDaysLeft && !archiveWarningSentDays.has(day));
      if (dueArchiveWarnings.length > 0) {
        const selectedDay = dueArchiveWarnings[0];
        archiveWarningSentDays.add(selectedDay);
        updates.lifecycle_archive_warning_days_sent = serializeReminderDaysSet(archiveWarningSentDays);

        if (user?.email) {
          const htmlBody = renderTemplate('20-archive-final-notice.html', {
            name: user.name || '',
            archive_date: formatDateLabel(archiveAt),
            resume_url: resumeUrl,
            days_left: String(selectedDay),
          });
          await sendResendEmail({
            from: process.env.RESEND_ALERT_FROM_EMAIL || 'alerts@mymckenziecs.com',
            to: user.email,
            subject: `Hard lock in ${selectedDay} day${selectedDay === 1 ? '' : 's'} - action recommended`,
            htmlBody,
            tag: `billing-hard-lock-warning-${selectedDay}d`,
          });
          hardLockWarningsSent += 1;
        }
      }

      const deleteDaysLeft = daysUntil(deleteAt, now);
      const dueDeleteWarnings =
        deleteDaysLeft === null || sub.lifecycle_deleted_at
          ? []
          : warningDays.filter((day) => day === deleteDaysLeft && !deleteWarningSentDays.has(day));
      if (dueDeleteWarnings.length > 0) {
        const selectedDay = dueDeleteWarnings[0];
        deleteWarningSentDays.add(selectedDay);
        updates.lifecycle_delete_warning_days_sent = serializeReminderDaysSet(deleteWarningSentDays);

        if (user?.email) {
          const htmlBody = renderTemplate('21-deletion-final-notice.html', {
            name: user.name || '',
            delete_date: formatDateLabel(deleteAt),
            resume_url: resumeUrl,
            days_left: String(selectedDay),
          });
          await sendResendEmail({
            from: process.env.RESEND_ALERT_FROM_EMAIL || 'alerts@mymckenziecs.com',
            to: user.email,
            subject: `Deletion warning: ${selectedDay} day${selectedDay === 1 ? '' : 's'} remaining`,
            htmlBody,
            tag: `billing-delete-warning-${selectedDay}d`,
          });
          deleteWarningsSent += 1;
        }
      }

      if (!sub.lifecycle_archived_at && now >= archiveAt) {
        await archiveUserData(sub.user_id, nowIso);
        updates.lifecycle_archived_at = nowIso;
        archived += 1;
      }

      if (!sub.lifecycle_deleted_at && now >= deleteAt) {
        await deleteRetainedUserData(sub.user_id);
        updates.lifecycle_deleted_at = nowIso;
        deleted += 1;
      }

      if (Object.keys(updates).length > 0) {
        await supabaseAdmin
          .from('subscriptions')
          .update({
            ...updates,
            updated_at: nowIso,
          })
          .eq('id', sub.id);
      }
    }

    return NextResponse.json({
      ok: true,
      hardLockWarningsSent,
      deleteWarningsSent,
      archived,
      deleted,
    });
  } catch (error: any) {
    console.error('Subscription lifecycle cron failed', error);
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}
