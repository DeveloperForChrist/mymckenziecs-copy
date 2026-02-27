const DAY_MS = 24 * 60 * 60 * 1000;

function parseEnvInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(raw || '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export function getLifecycleArchiveDays(): number {
  return parseEnvInt(process.env.BILLING_LIFECYCLE_ARCHIVE_DAYS, 30, 1, 730);
}

export function getLifecycleDeleteDays(): number {
  const archiveDays = getLifecycleArchiveDays();
  return parseEnvInt(process.env.BILLING_LIFECYCLE_DELETE_DAYS, 90, archiveDays + 1, 3650);
}

export function getLifecycleWarningDays(): number[] {
  const raw = (process.env.BILLING_LIFECYCLE_WARNING_DAYS || '7,5,3,1').trim();
  const parsed = raw
    .split(',')
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isFinite(value))
    .map((value) => Math.max(1, Math.min(30, value)));
  const unique = Array.from(new Set(parsed));
  return unique.length > 0 ? unique : [7, 5, 3, 1];
}

export function isLifecycleLapsedStatus(status: unknown): boolean {
  const normalized = String(status || '').toLowerCase().trim();
  return normalized === 'expired' || normalized === 'cancelled';
}

export function buildLifecycleSchedule(lapsedAt: Date | string | number | null | undefined) {
  const parsed = lapsedAt ? new Date(lapsedAt) : new Date();
  const base = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  const archiveAt = new Date(base.getTime() + getLifecycleArchiveDays() * DAY_MS);
  const deleteAt = new Date(base.getTime() + getLifecycleDeleteDays() * DAY_MS);
  return {
    lapsedAt: base,
    archiveAt,
    deleteAt,
  };
}

export function parseReminderDaysSet(value: unknown): Set<number> {
  const sent = new Set<number>();
  if (Array.isArray(value)) {
    for (const entry of value) {
      const num = Number.parseInt(String(entry), 10);
      if (Number.isFinite(num) && num > 0) sent.add(num);
    }
  }
  return sent;
}

export function serializeReminderDaysSet(set: Set<number>): number[] {
  return Array.from(set).sort((a, b) => a - b);
}

export function daysSince(input: Date | string | number | null | undefined, now = new Date()): number {
  const date = input ? new Date(input) : null;
  if (!date || Number.isNaN(date.getTime())) return 0;
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / DAY_MS));
}

export function daysUntil(input: Date | string | number | null | undefined, now = new Date()): number | null {
  const date = input ? new Date(input) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return Math.ceil((date.getTime() - now.getTime()) / DAY_MS);
}
