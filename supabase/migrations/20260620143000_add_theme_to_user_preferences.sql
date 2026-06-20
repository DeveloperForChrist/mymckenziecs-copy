alter table public.user_preferences
add column if not exists theme text default 'light';

update public.user_preferences
set theme = 'light'
where theme is null;

alter table public.user_preferences
alter column theme set default 'light';

alter table public.user_preferences
alter column theme set not null;

do $$
begin
  alter table public.user_preferences
    add constraint user_preferences_theme_check
    check (theme in ('light', 'dark'));
exception
  when duplicate_object then null;
end $$;
