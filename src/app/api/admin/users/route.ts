import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/database/supabase-server';
import { requireAdminSession } from '@/lib/auth/admin-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type UserRow = {
  id: string
  email?: string | null
  name?: string | null
  fullName?: string | null
  address?: string | null
  created_at?: string | null
  updated_at?: string | null
}


export async function GET(request: Request) {
  try {
    const admin = await requireAdminSession();
    if (!admin.ok) return admin.response;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const planFilter = searchParams.get('plan') || '';
    const limit = parseInt(searchParams.get('limit') || '50');

    // Fetch users from Supabase
    let query = supabaseAdmin
      .from('users')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data: usersData, error: usersError } = await query;

    if (usersError) {
      console.error('Error fetching users:', usersError);
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }

    const users = [];

    for (const userData of (usersData || []) as UserRow[]) {
      // Check subscription for plan - get the most recent active subscription
      const { data: activeSub } = await supabaseAdmin
        .from('subscriptions')
        .select('plan_type, updated_at')
        .eq('user_id', userData.id)
        .eq('status', 'active')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const userPlan = activeSub?.plan_type || 'Free';

      // Apply plan filter
      if (planFilter && userPlan !== planFilter) {
        continue;
      }

      users.push({
        id: userData.id,
        email: userData.email || 'N/A',
        fullName: userData.name || userData.fullName || 'N/A',
        plan: userPlan,
        createdAt: userData.created_at || new Date().toISOString(),
        lastActive: userData.updated_at || null,
        address: userData.address || '',
        disabled: false,
        emailVerified: true
      });
    }

    return NextResponse.json({ users, total: users.length });
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
        const validPlans = ['free', 'standard', 'essential', 'plus', 'premium cheap', 'premium pro'];
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
          requestedPlan === 'plus'
            ? 'premium pro'
            : requestedPlan === 'essential'
              ? 'premium'
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
