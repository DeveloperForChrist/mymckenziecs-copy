-- Speeds up dashboard calendar alert counts:
-- WHERE user_id = ? AND completed = false AND date BETWEEN ? AND ?
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_date_incomplete
  ON public.calendar_events (user_id, date)
  WHERE completed = false;
