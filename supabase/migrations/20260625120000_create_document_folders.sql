create table if not exists public.document_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_document_folders_user_name
  on public.document_folders (user_id, lower(name));

create index if not exists idx_document_folders_user_created
  on public.document_folders (user_id, created_at desc);

create table if not exists public.document_folder_assignments (
  document_id uuid primary key references public.documents(id) on delete cascade,
  folder_id uuid not null references public.document_folders(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_document_folder_assignments_user
  on public.document_folder_assignments (user_id);

create index if not exists idx_document_folder_assignments_folder
  on public.document_folder_assignments (folder_id);

alter table public.document_folders enable row level security;
alter table public.document_folder_assignments enable row level security;

drop policy if exists document_folders_all_own on public.document_folders;
create policy document_folders_all_own
  on public.document_folders
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists document_folder_assignments_all_own on public.document_folder_assignments;
create policy document_folder_assignments_all_own
  on public.document_folder_assignments
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
