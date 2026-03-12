import { supabaseAdmin } from '@/lib/database/supabase-server';

const FEATURE_KEY_BASIC_WEB_SEARCH_DAILY = 'basic_web_search_daily';
const DEFAULT_BASIC_WEB_SEARCH_DAILY_LIMIT = 5;
const DEFAULT_BASIC_WEB_SEARCH_TIMEZONE = 'Europe/London';

const parsePositiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

export const BASIC_WEB_SEARCH_DAILY_LIMIT = parsePositiveInt(
  process.env.BASIC_WEB_SEARCH_DAILY_LIMIT,
  DEFAULT_BASIC_WEB_SEARCH_DAILY_LIMIT
);

export const BASIC_WEB_SEARCH_TIMEZONE =
  (process.env.BASIC_WEB_SEARCH_TIMEZONE || '').trim() || DEFAULT_BASIC_WEB_SEARCH_TIMEZONE;

export type BasicDailyWebSearchQuotaResult = {
  allowed: boolean;
  limit: number;
  used: number;
  remaining: number;
  usageDate: string | null;
  resetsAt: string | null;
};

export const BASIC_DAILY_WEB_SEARCH_LIMIT_REACHED_NOTICE =
  'Daily web search limit reached. Back to standard answers.';

export const getBasicDailyWebSearchLimitReachedNotice = (_resetsAt: string | null | undefined) =>
  BASIC_DAILY_WEB_SEARCH_LIMIT_REACHED_NOTICE;

export async function consumeBasicDailyWebSearchQuota(userId: string): Promise<BasicDailyWebSearchQuotaResult> {
  const limit = Math.max(0, BASIC_WEB_SEARCH_DAILY_LIMIT);

  if (!userId || limit <= 0) {
    return {
      allowed: false,
      limit,
      used: 0,
      remaining: 0,
      usageDate: null,
      resetsAt: null,
    };
  }

  const { data, error } = await supabaseAdmin.rpc('consume_daily_feature_quota', {
    p_user_id: userId,
    p_feature_key: FEATURE_KEY_BASIC_WEB_SEARCH_DAILY,
    p_limit: limit,
    p_timezone: BASIC_WEB_SEARCH_TIMEZONE,
  });

  if (error) {
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;
  const allowed = Boolean(row?.allowed);
  const used = Number.isFinite(Number(row?.used)) ? Math.max(0, Number(row?.used)) : 0;
  const remaining = Number.isFinite(Number(row?.remaining)) ? Math.max(0, Number(row?.remaining)) : Math.max(0, limit - used);
  const usageDate = row?.usage_date ? String(row.usage_date) : null;
  const resetsAt = row?.resets_at ? String(row.resets_at) : null;

  return {
    allowed,
    limit,
    used,
    remaining,
    usageDate,
    resetsAt,
  };
}
