-- Visibility and request fixes.
-- Safe to run multiple times in Supabase SQL Editor.

alter table public.customers
add column if not exists option_tablet boolean default false;

alter table public.customers
add column if not exists option_qr boolean default false;

alter table public.customers
add column if not exists needs_tablet boolean default false;

alter table public.customers
add column if not exists tablet_shipped boolean default false;

alter table public.customers
add column if not exists tablet_shipped_at timestamptz;

alter table public.customers
add column if not exists tablet_billed boolean default false;

alter table public.customers
add column if not exists qr_billed boolean default false;

alter table public.customers
add column if not exists service_fee_billed boolean default false;

update public.customers
set
  option_tablet = coalesce(option_tablet, false) or coalesce(selected_option = 'tablet', false),
  option_qr = coalesce(option_qr, false) or coalesce(selected_option = 'qr', false),
  needs_tablet = coalesce(needs_tablet, false),
  tablet_shipped = coalesce(tablet_shipped, false),
  tablet_billed = coalesce(tablet_billed, false),
  qr_billed = coalesce(qr_billed, false),
  service_fee_billed = coalesce(service_fee_billed, false);

create table if not exists public.customer_delete_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  requested_by uuid not null references public.profiles(id),
  reason text,
  status text check (status in ('pending', 'approved', 'rejected')) not null default 'pending',
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists customer_delete_requests_customer_id_idx
on public.customer_delete_requests(customer_id);

create unique index if not exists customer_delete_requests_one_pending_idx
on public.customer_delete_requests(customer_id)
where status = 'pending';

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

create or replace function public.has_admin_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('admin', 'sub_admin')
  );
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_customer_delete_requests_updated_at on public.customer_delete_requests;
create trigger touch_customer_delete_requests_updated_at
before update on public.customer_delete_requests
for each row
execute function public.touch_updated_at();

drop function if exists public.request_customer_delete(uuid, text);

create or replace function public.request_customer_delete(target_customer_id uuid, request_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  pending_request_id uuid;
begin
  if current_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if not exists (
    select 1
    from public.customers
    where id = target_customer_id
      and assigned_worker_id = current_user_id
  ) then
    raise exception '삭제 요청 권한이 없습니다.';
  end if;

  select id
  into pending_request_id
  from public.customer_delete_requests
  where customer_id = target_customer_id
    and status = 'pending'
  limit 1;

  if pending_request_id is null then
    insert into public.customer_delete_requests (customer_id, requested_by, reason)
    values (target_customer_id, current_user_id, nullif(request_reason, ''));
  else
    update public.customer_delete_requests
    set
      requested_by = current_user_id,
      reason = coalesce(nullif(request_reason, ''), reason),
      updated_at = now()
    where id = pending_request_id;
  end if;
end;
$$;

drop function if exists public.delete_customer_submission(uuid);

create or replace function public.delete_customer_submission(target_customer_id uuid)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  file_paths text[] := array[]::text[];
begin
  if not public.is_admin() then
    raise exception '관리자 권한이 필요합니다.';
  end if;

  if to_regclass('public.customer_documents') is not null then
    select coalesce(array_agg(file_path), array[]::text[])
    into file_paths
    from public.customer_documents
    where customer_id = target_customer_id;
  end if;

  delete from public.customers
  where id = target_customer_id;

  if not found then
    raise exception '삭제할 제출 건을 찾을 수 없습니다.';
  end if;

  return file_paths;
end;
$$;

alter table public.customer_delete_requests enable row level security;

grant select, update on public.customer_delete_requests to authenticated;
grant execute on function public.request_customer_delete(uuid, text) to authenticated;
grant execute on function public.delete_customer_submission(uuid) to authenticated;

drop policy if exists "customer_delete_requests_select_worker_or_admin" on public.customer_delete_requests;
create policy "customer_delete_requests_select_worker_or_admin"
on public.customer_delete_requests
for select
to authenticated
using (requested_by = auth.uid() or public.has_admin_access());

drop policy if exists "customer_delete_requests_admin_update" on public.customer_delete_requests;
create policy "customer_delete_requests_admin_update"
on public.customer_delete_requests
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

notify pgrst, 'reload schema';
