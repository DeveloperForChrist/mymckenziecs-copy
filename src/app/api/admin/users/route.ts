import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/database/supabase-server';
import { requireAdminSession } from '@/lib/auth/admin-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type UserRow = {
  id: string
  email?: string | null
  name?: string | null
  created_at?: string | null
  updated_at?: string | null
}

type SubscriptionRow = {
  user_id?: string | null
  plan_type?: string | null
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function parsePositiveInt(input: string | null, fallback: number) {
  const parsed = Number.parseInt(input || '', 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function clampLimit(input: string | null) {
  const parsed = parsePositiveInt(input, DEFAULT_LIMIT);
  return Math.min(Math.max(parsed, 1), MAX_LIMIT);
}

function normalizePlanLabel(input: string | null | undefined) {
  const value = String(input || '').trim().toLowerCase();
  if (!value) return '';
  if (value === 'assistant plus') return 'assistant plus';
  if (value === 'assistant pro') return 'assistant pro';
  if (value === 'premium +' || value === 'premium plus' || value === 'plus' || value === 'premium pro') return 'premium +';
  if (value === 'basic' || value === 'essential' || value === 'premium cheap') return 'basic';
  if (value === 'premium') return 'premium';
  if (value === 'none' || value === 'no plan' || value === 'inactive') return 'no plan';
  return value;
}

function formatPlanLabel(input: string | null | undefined) {
  const normalized = normalizePlanLabel(input);
  if (normalized === 'assistant plus') return 'Assistant Plus';
  if (normalized === 'assistant pro') return 'Assistant Pro';
  if (normalized === 'premium +') return 'Premium +';
  if (normalized === 'premium') return 'Premium';
  if (normalized === 'basic') return 'Basic';
  if (normalized === 'no plan' || !normalized) return 'No plan';
  return input || 'No plan';
}

export async function GET(request: Request) {
  try {
    const admin = await requireAdminSession();
    if (!admin.ok) return admin.response;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const planFilter = normalizePlanLabel(searchParams.get('plan'));
    const limit = clampLimit(searchParams.get('limit'));
    const offset = parsePositiveInt(searchParams.get('offset'), 0);
    const rangeEnd = offset + limit - 1;

    let query = supabaseAdmin
      .from('users')
      .select('id, email, name, created_at, updated_at')
      .order('created_at', { ascending: false })
      .range(offset, rangeEnd);

    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data: usersData, error: usersError } = await query;

    if (usersError) {
      console.error('Error fetching users:', usersError);
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }

    const typedUsersData = (usersData || []) as UserRow[];
    const userIds = typedUsersData.map((row) => row.id).filter(Boolean);
    const latestPlanByUser = new Map<string, string>();

    if (userIds.length > 0) {
      const { data: subscriptionsData, error: subscriptionsError } = await supabaseAdmin
        .from('subscriptions')
        .select('user_id, plan_type, updated_at')
        .in('user_id', userIds)
        .in('status', ['active', 'past_due'])
        .order('updated_at', { ascending: false });

      if (subscriptionsError) {
        console.error('Error fetching subscriptions:', subscriptionsError);
      } else {
        for (const row of (subscriptionsData || []) as SubscriptionRow[]) {
          const userId = String(row.user_id || '');
          if (!userId || latestPlanByUser.has(userId)) continue;
          latestPlanByUser.set(userId, formatPlanLabel(row.plan_type));
        }
      }
    }

    const users = [];

    for (const userData of typedUsersData) {
      const userPlan = latestPlanByUser.get(userData.id) || 'No plan';

      if (planFilter && normalizePlanLabel(userPlan) !== planFilter) {
        continue;
      }

      users.push({
        id: userData.id,
        email: userData.email || 'N/A',
        fullName: userData.name || 'N/A',
        plan: userPlan,
        createdAt: userData.created_at || new Date().toISOString(),
        lastActive: userData.updated_at || null,
        address: '',
        disabled: false,
        emailVerified: true
      });
    }

    return NextResponse.json({
      users,
      total: users.length,
      pagination: {
        limit,
        offset,
        hasMore: typedUsersData.length === limit,
      },
    });
  } catch (error: unknown) {
    console.error('Error fetching users:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch users';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdminSession();
    if (!admin.ok) return admin.response;

    const { action, userId, data } = await request.json();
    
    // Validate required fields
    if (!action || !userId) {
      console.error('❌ Missing required fields:', { action, userId });
      return NextResponse.json(
        { error: 'Missing required fields: action and userId' },
        { status: 400 }
      );
    }

    // Log for debugging
    console.log(`🔄 Admin action: ${action} for user ${userId}`, data);

    switch (action) {
      case 'suspend':
        // Note: Supabase Auth admin operations require service role
        // For now, we can't disable users without Supabase Auth Admin API
        return NextResponse.json({ success: true, message: 'User suspended (no-op in Supabase)' });

      case 'activate':
        return NextResponse.json({ success: true, message: 'User activated (no-op in Supabase)' });

      case 'updatePlan': {
        // Validate plan
        const validPlans = ['none', 'no plan', 'inactive', 'basic', 'premium', 'premium +', 'premium plus', 'essential', 'plus', 'premium cheap', 'premium pro'];
        if (!data?.plan || !validPlans.includes(data.plan.toLowerCase())) {
          console.error('❌ Invalid plan:', data?.plan);
          return NextResponse.json({ 
            error: `Invalid plan. Must be one of: ${validPlans.join(', ')}`,
            receivedPlan: data?.plan,
            validPlans
          }, { status: 400 });
        }
        
        const requestedPlan = data.plan.toLowerCase();
        const planToSet =
          requestedPlan === 'premium +' || requestedPlan === 'premium plus' || requestedPlan === 'plus' || requestedPlan === 'premium pro'
            ? 'Premium +'
            : requestedPlan === 'premium'
              ? 'Premium'
              : requestedPlan === 'basic' || requestedPlan === 'essential' || requestedPlan === 'premium cheap'
                ? 'Basic'
                : requestedPlan === 'none' || requestedPlan === 'no plan' || requestedPlan === 'inactive'
                  ? 'No plan'
                  : requestedPlan;

        console.log(`🔄 Updating plan for user ${userId} to ${planToSet}`);

        // First, list all subscriptions for this user
        const { data: allSubs, error: listError } = await supabaseAdmin
          .from('subscriptions')
          .select('id, plan_type, status')
          .eq('user_id', userId);

        if (listError) {
          console.error('❌ Error listing subscriptions:', listError);
          return NextResponse.json({ 
            error: 'Failed to list subscriptions',
            details: listError.message 
          }, { status: 500 });
        }

        console.log(`Found ${allSubs?.length || 0} existing subscriptions for user ${userId}`, allSubs);

        if (allSubs && allSubs.length > 0) {
          // Update the first subscription
          const subToUpdate = allSubs[0];
          console.log(`Updating subscription ${subToUpdate.id}`);
          
          const { error: updateError } = await supabaseAdmin
            .from('subscriptions')
            .update({ 
              plan_type: planToSet, 
              status: 'active', 
              updated_at: new Date().toISOString() 
            })
            .eq('id', subToUpdate.id);

          if (updateError) {
            console.error('❌ Error updating subscription:', updateError);
            return NextResponse.json({ 
              error: 'Failed to update subscription',
              details: updateError.message,
              subscriptionId: subToUpdate.id
            }, { status: 500 });
          }
          
          console.log(`✅ Successfully updated subscription ${subToUpdate.id}`);
        } else {
          // Create new subscription if none exists
          console.log(`No subscriptions found, creating new one for user ${userId}`);
          
          const { error: insertError, data: insertedData } = await supabaseAdmin
            .from('subscriptions')
            .insert({ 
              user_id: userId, 
              plan_type: planToSet, 
              status: 'active',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .select();

          if (insertError) {
            console.error('❌ Error creating subscription:', insertError);
            return NextResponse.json({ 
              error: 'Failed to create subscription',
              details: insertError.message 
            }, { status: 500 });
          }
          
          console.log(`✅ Successfully created subscription:`, insertedData);
        }

        console.log(`✅ Successfully updated plan to ${planToSet} for user ${userId}`);
        return NextResponse.json({ 
          success: true, 
          message: `Plan successfully updated to ${planToSet}` 
        });
      }

      case 'delete': {
        // Delete user from users table (cascades to cases, messages, etc.)
        const { error: deleteError } = await supabaseAdmin
          .from('users')
          .delete()
          .eq('id', userId);

        if (deleteError) {
          console.error('Failed to delete user:', deleteError);
          return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
        }
        return NextResponse.json({ success: true, message: 'User deleted' });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error: unknown) {
    console.error('Error performing user action:', error);
    const message = error instanceof Error ? error.message : 'Failed to perform user action';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
