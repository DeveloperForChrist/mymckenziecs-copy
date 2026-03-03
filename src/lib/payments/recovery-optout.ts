import crypto from 'crypto';

function getSigningSecret() {
  return (
    process.env.BILLING_RECOVERY_OPT_OUT_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    'mymckenziecs-recovery-optout-secret'
  );
}

function sign(value: string): string {
  return crypto.createHmac('sha256', getSigningSecret()).update(value).digest('base64url');
}

function timingSafeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) return false;
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

export function verifyBillingRecoveryOptOutToken(token: string): { userId: string; expiresAt: number } | null {
  try {
    if (!token) return null;
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const [userId, expiresRaw, signature] = decoded.split('.');
    if (!userId || !expiresRaw || !signature) return null;

    const payload = `${userId}.${expiresRaw}`;
    const expected = sign(payload);
    if (!timingSafeEqual(signature, expected)) return null;

    const expiresAt = Number.parseInt(expiresRaw, 10);
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;

    return { userId, expiresAt };
  } catch {
    return null;
  }
}
