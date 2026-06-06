alter table public.profiles
add column if not exists kakao_display_name text;

alter table public.customers
add column if not exists address text;

alter table public.customers
add column if not exists moa_solution_id text;

alter table public.customers
add column if not exists moa_solution_password text;

alter table public.customers
add column if not exists kakao_business_id text;

alter table public.customers
add column if not exists kakao_business_password text;

alter table public.customers
add column if not exists option_tablet boolean default false;

alter table public.customers
add column if not exists option_qr boolean default false;

alter table public.customers
add column if not exists business_progress_status text default '진행중';

alter table public.customers
add column if not exists business_auth_done boolean default false;

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
  business_progress_status = coalesce(business_progress_status, '진행중'),
  business_auth_done = coalesce(business_auth_done, false),
  needs_tablet = coalesce(needs_tablet, false),
  tablet_shipped = coalesce(tablet_shipped, false),
  tablet_billed = coalesce(tablet_billed, false),
  qr_billed = coalesce(qr_billed, false),
  service_fee_billed = coalesce(service_fee_billed, false);

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

drop function if exists public.sync_profile_from_allowlist(text);

create or replace function public.sync_profile_from_allowlist(target_email text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  allowed public.login_allowlist%rowtype;
  target_user_id uuid;
  target_user_email text;
  target_user_metadata jsonb;
  kakao_name text;
begin
  if not public.has_admin_access() then
    raise exception '관리자 권한이 필요합니다.';
  end if;

  select *
  into allowed
  from public.login_allowlist
  where lower(email) = lower(target_email)
    and active = true;

  if allowed.email is null then
    return;
  end if;

  select id, email, raw_user_meta_data
  into target_user_id, target_user_email, target_user_metadata
  from auth.users
  where lower(email) = lower(target_email);

  if target_user_id is null then
    return;
  end if;

  kakao_name := coalesce(
    nullif(target_user_metadata ->> 'name', ''),
    nullif(target_user_metadata ->> 'full_name', ''),
    nullif(target_user_metadata ->> 'nickname', ''),
    nullif(target_user_metadata ->> 'preferred_username', ''),
    nullif(target_user_metadata ->> 'user_name', ''),
    target_user_email,
    allowed.email
  );

  insert into public.profiles (id, name, kakao_display_name, role)
  values (target_user_id, coalesce(allowed.name, allowed.email), kakao_name, allowed.role)
  on conflict (id)
  do update set
    name = excluded.name,
    kakao_display_name = coalesce(public.profiles.kakao_display_name, excluded.kakao_display_name),
    role = excluded.role;
end;
$$;

update public.customers
set
  business_progress_status = '진행중',
  business_auth_done = false
where business_progress_status = '사업자 인증 완료';

alter table public.customers
drop constraint if exists customers_business_progress_status_check;

alter table public.customers
add constraint customers_business_progress_status_check
check (business_progress_status in ('진행중', '카카오비즈니스 채널 개설 완료'));

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
    raise exception '올바른 카카오 채널 상태가 아닙니다.';
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

drop function if exists public.delete_customer_submission(uuid);

create or replace function public.delete_customer_submission(target_customer_id uuid)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
begin
  if not public.is_admin() then
    raise exception '관리자 권한이 필요합니다.';
  end if;

  delete from public.customers
  where id = target_customer_id;

  if not found then
    raise exception '삭제할 제출 건을 찾을 수 없습니다.';
  end if;

  return array[]::text[];
end;
$$;

grant usage on schema public to authenticated;
grant select, insert, update on public.customers to authenticated;
grant execute on function public.sync_profile_from_allowlist(text) to authenticated;
grant execute on function public.update_customer_worker_progress(uuid, text, text, text, text, text, text) to authenticated;
grant execute on function public.delete_customer_submission(uuid) to authenticated;

drop policy if exists "customers_admin_update" on public.customers;

create policy "customers_admin_update"
on public.customers
for update
to authenticated
using (public.has_admin_access())
with check (public.has_admin_access());

notify pgrst, 'reload schema';
