alter table public.profiles
add column if not exists kakao_display_name text;

update public.profiles
set kakao_display_name = coalesce(
  public.profiles.kakao_display_name,
  nullif(auth_user.raw_user_meta_data ->> 'name', ''),
  nullif(auth_user.raw_user_meta_data ->> 'full_name', ''),
  nullif(auth_user.raw_user_meta_data ->> 'nickname', ''),
  nullif(auth_user.raw_user_meta_data ->> 'preferred_username', ''),
  nullif(auth_user.raw_user_meta_data ->> 'user_name', ''),
  auth_user.email
)
from auth.users as auth_user
where auth_user.id = public.profiles.id
  and public.profiles.kakao_display_name is null;

alter table public.customers
add column if not exists option_tablet boolean default false;

alter table public.customers
add column if not exists option_qr boolean default false;

alter table public.customers
add column if not exists qr_billed boolean default false;

update public.customers
set
  option_tablet = coalesce(option_tablet, false) or coalesce(selected_option = 'tablet', false),
  option_qr = coalesce(option_qr, false) or coalesce(selected_option = 'qr', false),
  qr_billed = coalesce(qr_billed, false);

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

drop trigger if exists touch_customer_delete_requests_updated_at on public.customer_delete_requests;
create trigger touch_customer_delete_requests_updated_at
before update on public.customer_delete_requests
for each row
execute function public.touch_updated_at();

alter table public.customer_delete_requests enable row level security;

grant select, update on public.customer_delete_requests to authenticated;
grant execute on function public.request_customer_delete(uuid, text) to authenticated;

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

alter table public.customers
add column if not exists address text;

alter table public.customers
add column if not exists moa_solution_id text;

alter table public.customers
add column if not exists moa_solution_password text;

alter table public.customers
add column if not exists business_progress_status text default '진행중';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'customers_business_progress_status_check'
      and conrelid = 'public.customers'::regclass
  ) then
    alter table public.customers
    add constraint customers_business_progress_status_check
    check (business_progress_status in ('진행중', '카카오비즈니스 채널 개설 완료'));
  end if;
end $$;

update public.customers
set
  business_progress_status = coalesce(
    business_progress_status,
    case
      when business_auth_done then '진행중'
      else '진행중'
    end
  ),
  business_auth_done = coalesce(business_auth_done, false);

drop function if exists public.update_customer_worker_progress(uuid, text, text, text, text, text, text);

create or replace function public.update_customer_worker_progress(
  target_customer_id uuid,
  customer_address text default null,
  kakao_id text default null,
  kakao_password text default null,
  moa_id text default null,
  moa_password text default null,
  progress_status text default '진행중'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_progress text := coalesce(progress_status, '진행중');
begin
  if current_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if normalized_progress = '사업자 인증 완료' then
    normalized_progress := '진행중';
  end if;

  if normalized_progress not in ('진행중', '카카오비즈니스 채널 개설 완료') then
    raise exception '올바른 진행 상태가 아닙니다.';
  end if;

  update public.customers
  set
    address = nullif(customer_address, ''),
    kakao_business_id = nullif(kakao_id, ''),
    kakao_business_password = nullif(kakao_password, ''),
    moa_solution_id = nullif(moa_id, ''),
    moa_solution_password = nullif(moa_password, ''),
    business_progress_status = normalized_progress,
    business_auth_done = normalized_progress = '카카오비즈니스 채널 개설 완료',
    updated_at = now()
  where id = target_customer_id
    and assigned_worker_id = current_user_id;

  if not found then
    raise exception '수정할 고객을 찾을 수 없거나 권한이 없습니다.';
  end if;
end;
$$;

grant execute on function public.update_customer_worker_progress(uuid, text, text, text, text, text, text) to authenticated;

drop function if exists public.update_worker_display_name(uuid, text);

create or replace function public.update_worker_display_name(target_worker_id uuid, display_name text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  clean_name text := nullif(trim(display_name), '');
  target_role text;
begin
  if not public.has_admin_access() then
    raise exception '관리자 권한이 필요합니다.';
  end if;

  if clean_name is null then
    raise exception '협력자 이름을 입력하세요.';
  end if;

  select role
  into target_role
  from public.profiles
  where id = target_worker_id;

  if target_role is null then
    raise exception '협력자를 찾을 수 없습니다.';
  end if;

  if target_role <> 'worker' then
    raise exception '협력자 이름만 수정할 수 있습니다.';
  end if;

  update public.profiles
  set name = clean_name
  where id = target_worker_id;

  update public.login_allowlist
  set name = clean_name
  where lower(email) = (
    select lower(email)
    from auth.users
    where id = target_worker_id
  );
end;
$$;

grant execute on function public.update_worker_display_name(uuid, text) to authenticated;

notify pgrst, 'reload schema';
