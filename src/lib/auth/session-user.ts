type AuthLikeIdentity = {
  provider?: string | null;
} | null;

type AuthLikeUser = {
  is_anonymous?: boolean | null;
  app_metadata?: {
    provider?: string | null;
  } | null;
  identities?: AuthLikeIdentity[] | null;
} | null | undefined;

export function isAnonymousAuthUser(user: AuthLikeUser): boolean {
  if (!user) return false;
  if (user.is_anonymous === true) return true;

  const provider = String(user.app_metadata?.provider || '').toLowerCase();
  if (provider === 'anonymous') return true;

  const identities = Array.isArray(user.identities) ? user.identities : [];
  return identities.some((identity) => String(identity?.provider || '').toLowerCase() === 'anonymous');
}

export function isBillingEligibleUser(user: AuthLikeUser): boolean {
  return Boolean(user) && !isAnonymousAuthUser(user);
}
