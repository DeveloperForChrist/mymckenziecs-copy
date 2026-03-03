-- Speeds up calendar page reads:
-- WHERE user_id = ? AND date BETWEEN ? AND ? ORDER BY date
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_id_date
  ON public.calendar_events (user_id, date);
