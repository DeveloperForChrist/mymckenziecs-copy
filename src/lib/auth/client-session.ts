// Supabase handles session management automatically via cookies
// This file is kept for backwards compatibility but is now a no-op

export const syncUserSession = async (user: any | null) => {
  // Supabase Auth handles session sync automatically
  void user;
}
