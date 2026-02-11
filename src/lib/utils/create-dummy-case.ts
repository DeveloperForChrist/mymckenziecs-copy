import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser';

export async function createDummyCaseForCurrentUser() {
  const supabase = getSupabaseBrowserClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    throw new Error('Not signed in');
  }
  // Creating cases is restricted to the Case Profile flow.
  // Check whether the user already has a case profile; if not, refuse to create.
  const userId = authData.user.id;
  const res = await fetch(`/api/user/case-details?userId=${encodeURIComponent(userId)}`);
  if (!res.ok) {
    throw new Error('Failed to check case profile');
  }
  const json = await res.json();
  if (!json?.case?.id) {
    throw new Error('No case profile found — create a Case Profile in Settings first');
  }

  return 'User already has a case profile';
}