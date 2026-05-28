import { supabaseAdmin } from '@/lib/database/supabase-server';

const FEATURE_KEY_BASIC_WEB_SEARCH_DAILY = 'basic_web_search_daily';
const FEATURE_KEY_ASSISTANT_FREE_WEB_SEARCH_DAILY = 'assistant_free_web_search_daily';
const FEATURE_KEY_ASSISTANT_PLUS_WEB_SEARCH_DAILY = 'assistant_plus_web_search_daily';
const FEATURE_KEY_ASSISTANT_PRO_CASE_LAW_RETRIEVAL_DAILY = 'assistant_pro_case_law_retrieval_daily';
const FEATURE_KEY_ASSISTANT_PLUS_WEB_SEARCH_MONTHLY = 'assistant_plus_web_search_monthly';
const FEATURE_KEY_ASSISTANT_PRO_WEB_SEARCH_MONTHLY = 'assistant_pro_web_search_monthly';
const FEATURE_KEY_ASSISTANT_PRO_CASE_LAW_RETRIEVAL_MONTHLY = 'assistant_pro_case_law_retrieval_monthly';
const DEFAULT_BASIC_WEB_SEARCH_DAILY_LIMIT = 5;
const DEFAULT_ASSISTANT_FREE_WEB_SEARCH_DAILY_LIMIT = 3;
const DEFAULT_ASSISTANT_PLUS_WEB_SEARCH_DAILY_LIMIT = 15;
const DEFAULT_ASSISTANT_PRO_CASE_LAW_RETRIEVAL_DAILY_LIMIT = 50;
const DEFAULT_ASSISTANT_PLUS_WEB_SEARCH_MONTHLY_LIMIT = 150;
const DEFAULT_ASSISTANT_PRO_WEB_SEARCH_MONTHLY_LIMIT = 750;
const DEFAULT_ASSISTANT_PRO_CASE_LAW_RETRIEVAL_MONTHLY_LIMIT = 500;
const DEFAULT_BASIC_WEB_SEARCH_TIMEZONE = 'Europe/London';

const parsePositiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

export const BASIC_WEB_SEARCH_DAILY_LIMIT = parsePositiveInt(
  process.env.BASIC_WEB_SEARCH_DAILY_LIMIT,
  DEFAULT_BASIC_WEB_SEARCH_DAILY_LIMIT
);

export const ASSISTANT_FREE_WEB_SEARCH_DAILY_LIMIT = parsePositiveInt(
  process.env.ASSISTANT_FREE_WEB_SEARCH_DAILY_LIMIT,
  DEFAULT_ASSISTANT_FREE_WEB_SEARCH_DAILY_LIMIT
);

export const ASSISTANT_PLUS_WEB_SEARCH_DAILY_LIMIT = parsePositiveInt(
  process.env.ASSISTANT_PLUS_WEB_SEARCH_DAILY_LIMIT,
  DEFAULT_ASSISTANT_PLUS_WEB_SEARCH_DAILY_LIMIT
);

export const ASSISTANT_PRO_CASE_LAW_RETRIEVAL_DAILY_LIMIT = parsePositiveInt(
  process.env.ASSISTANT_PRO_CASE_LAW_RETRIEVAL_DAILY_LIMIT,
  DEFAULT_ASSISTANT_PRO_CASE_LAW_RETRIEVAL_DAILY_LIMIT
);

export const ASSISTANT_PLUS_WEB_SEARCH_MONTHLY_LIMIT = parsePositiveInt(
  process.env.ASSISTANT_PLUS_WEB_SEARCH_MONTHLY_LIMIT,
  DEFAULT_ASSISTANT_PLUS_WEB_SEARCH_MONTHLY_LIMIT
);

export const ASSISTANT_PRO_WEB_SEARCH_MONTHLY_LIMIT = parsePositiveInt(
  process.env.ASSISTANT_PRO_WEB_SEARCH_MONTHLY_LIMIT,
  DEFAULT_ASSISTANT_PRO_WEB_SEARCH_MONTHLY_LIMIT
);

export const ASSISTANT_PRO_CASE_LAW_RETRIEVAL_MONTHLY_LIMIT = parsePositiveInt(
  process.env.ASSISTANT_PRO_CASE_LAW_RETRIEVAL_MONTHLY_LIMIT,
  DEFAULT_ASSISTANT_PRO_CASE_LAW_RETRIEVAL_MONTHLY_LIMIT
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
  'You have used your web search limit for today. You can continue without web search, or upgrade for more search access.';

export const ASSISTANT_PLUS_WEB_SEARCH_LIMIT_REACHED_NOTICE =
  'You have reached your Assistant Plus web search limit. You can continue without web search, or upgrade to Pro for more search access.';

export const ASSISTANT_PRO_WEB_SEARCH_LIMIT_REACHED_NOTICE =
  'You have reached your Assistant Pro web search fair-use limit. You can continue without web search until it resets.';

export const ASSISTANT_PRO_CASE_LAW_RETRIEVAL_LIMIT_REACHED_NOTICE =
  'You have reached your case-law retrieval fair-use limit. You can continue using chat and web search until it resets.';

export const getBasicDailyWebSearchLimitReachedNotice = (_resetsAt: string | null | undefined) =>
  BASIC_DAILY_WEB_SEARCH_LIMIT_REACHED_NOTICE;

export const getAssistantProCaseLawRetrievalLimitReachedNotice = (_resetsAt: string | null | undefined) =>
  ASSISTANT_PRO_CASE_LAW_RETRIEVAL_LIMIT_REACHED_NOTICE;

export const getAssistantPlusWebSearchLimitReachedNotice = (_resetsAt: string | null | undefined) =>
  ASSISTANT_PLUS_WEB_SEARCH_LIMIT_REACHED_NOTICE;

export const getAssistantProWebSearchLimitReachedNotice = (_resetsAt: string | null | undefined) =>
  ASSISTANT_PRO_WEB_SEARCH_LIMIT_REACHED_NOTICE;

async function consumeDailyWebSearchQuota(
  userId: string,
  featureKey: string,
  limit: number
): Promise<BasicDailyWebSearchQuotaResult> {
  const normalizedLimit = Math.max(0, limit);

  if (!userId || normalizedLimit <= 0) {
    return {
      allowed: false,
      limit: normalizedLimit,
      used: 0,
      remaining: 0,
      usageDate: null,
      resetsAt: null,
    };
  }

  const { data, error } = await supabaseAdmin.rpc('consume_daily_feature_quota', {
    p_user_id: userId,
    p_feature_key: featureKey,
    p_limit: normalizedLimit,
    p_timezone: BASIC_WEB_SEARCH_TIMEZONE,
  });

  if (error) {
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;
  const allowed = Boolean(row?.allowed);
  const used = Number.isFinite(Number(row?.used)) ? Math.max(0, Number(row?.used)) : 0;
  const remaining = Number.isFinite(Number(row?.remaining)) ? Math.max(0, Number(row?.remaining)) : Math.max(0, normalizedLimit - used);
  const usageDate = row?.usage_date ? String(row.usage_date) : null;
  const resetsAt = row?.resets_at ? String(row.resets_at) : null;

  return {
    allowed,
    limit: normalizedLimit,
    used,
    remaining,
    usageDate,
    resetsAt,
  };
}

async function consumeMonthlyFeatureQuota(
  userId: string,
  featureKey: string,
  limit: number
): Promise<BasicDailyWebSearchQuotaResult> {
  const normalizedLimit = Math.max(0, limit);

  if (!userId || normalizedLimit <= 0) {
    return {
      allowed: false,
      limit: normalizedLimit,
      used: 0,
      remaining: 0,
      usageDate: null,
      resetsAt: null,
    };
  }

  const { data, error } = await supabaseAdmin.rpc('consume_monthly_feature_quota', {
    p_user_id: userId,
    p_feature_key: featureKey,
    p_limit: normalizedLimit,
    p_timezone: BASIC_WEB_SEARCH_TIMEZONE,
  });

  if (error) {
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;
  const allowed = Boolean(row?.allowed);
  const used = Number.isFinite(Number(row?.used)) ? Math.max(0, Number(row?.used)) : 0;
  const remaining = Number.isFinite(Number(row?.remaining)) ? Math.max(0, Number(row?.remaining)) : Math.max(0, normalizedLimit - used);
  const usageDate = row?.usage_month ? String(row.usage_month) : null;
  const resetsAt = row?.resets_at ? String(row.resets_at) : null;

  return {
    allowed,
    limit: normalizedLimit,
    used,
    remaining,
    usageDate,
    resetsAt,
  };
}

export async function consumeBasicDailyWebSearchQuota(userId: string): Promise<BasicDailyWebSearchQuotaResult> {
  return consumeDailyWebSearchQuota(userId, FEATURE_KEY_BASIC_WEB_SEARCH_DAILY, BASIC_WEB_SEARCH_DAILY_LIMIT);
}

export async function consumeAssistantFreeDailyWebSearchQuota(userId: string): Promise<BasicDailyWebSearchQuotaResult> {
  return consumeDailyWebSearchQuota(
    userId,
    FEATURE_KEY_ASSISTANT_FREE_WEB_SEARCH_DAILY,
    ASSISTANT_FREE_WEB_SEARCH_DAILY_LIMIT
  );
}

export async function consumeAssistantPlusDailyWebSearchQuota(userId: string): Promise<BasicDailyWebSearchQuotaResult> {
  return consumeDailyWebSearchQuota(
    userId,
    FEATURE_KEY_ASSISTANT_PLUS_WEB_SEARCH_DAILY,
    ASSISTANT_PLUS_WEB_SEARCH_DAILY_LIMIT
  );
}

export async function consumeAssistantPlusWebSearchQuota(userId: string): Promise<BasicDailyWebSearchQuotaResult> {
  const monthly = await consumeMonthlyFeatureQuota(
    userId,
    FEATURE_KEY_ASSISTANT_PLUS_WEB_SEARCH_MONTHLY,
    ASSISTANT_PLUS_WEB_SEARCH_MONTHLY_LIMIT
  );
  if (!monthly.allowed) return monthly;

  return consumeAssistantPlusDailyWebSearchQuota(userId);
}

export async function consumeAssistantProWebSearchQuota(userId: string): Promise<BasicDailyWebSearchQuotaResult> {
  return consumeMonthlyFeatureQuota(
    userId,
    FEATURE_KEY_ASSISTANT_PRO_WEB_SEARCH_MONTHLY,
    ASSISTANT_PRO_WEB_SEARCH_MONTHLY_LIMIT
  );
}

export async function consumeAssistantProDailyCaseLawRetrievalQuota(userId: string): Promise<BasicDailyWebSearchQuotaResult> {
  return consumeDailyWebSearchQuota(
    userId,
    FEATURE_KEY_ASSISTANT_PRO_CASE_LAW_RETRIEVAL_DAILY,
    ASSISTANT_PRO_CASE_LAW_RETRIEVAL_DAILY_LIMIT
  );
}

export async function consumeAssistantProCaseLawRetrievalQuota(userId: string): Promise<BasicDailyWebSearchQuotaResult> {
  const monthly = await consumeMonthlyFeatureQuota(
    userId,
    FEATURE_KEY_ASSISTANT_PRO_CASE_LAW_RETRIEVAL_MONTHLY,
    ASSISTANT_PRO_CASE_LAW_RETRIEVAL_MONTHLY_LIMIT
  );
  if (!monthly.allowed) return monthly;

  return consumeAssistantProDailyCaseLawRetrievalQuota(userId);
}
