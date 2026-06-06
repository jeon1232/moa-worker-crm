alter table public.profiles
drop constraint if exists profiles_role_check;

alter table public.profiles
add constraint profiles_role_check
check (role in ('admin', 'sub_admin', 'worker'));

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

alter table public.login_allowlist
drop constraint if exists login_allowlist_role_check;

alter table public.login_allowlist
add constraint login_allowlist_role_check
check (role in ('admin', 'sub_admin', 'worker'));

update public.login_allowlist
set active = true
where role in ('admin', 'sub_admin');

alter table public.login_allowlist
drop constraint if exists login_allowlist_privileged_active_check;

alter table public.login_allowlist
add constraint login_allowlist_privileged_active_check
check (role = 'worker' or active = true);

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

create table if not exists public.access_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  requested_role text check (requested_role in ('admin', 'sub_admin', 'worker')) not null default 'worker',
  status text check (status in ('pending', 'approved', 'rejected')) not null default 'pending',
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists access_requests_status_idx on public.access_requests(status);

create or replace function public.is_sub_admin()
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
      and role = 'sub_admin'
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

drop function if exists public.submit_access_request(text, text);

create or replace function public.submit_access_request(request_name text default null, request_role text default 'worker')
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text;
  normalized_role text := coalesce(request_role, 'worker');
begin
  if current_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if normalized_role not in ('admin', 'sub_admin', 'worker') then
    normalized_role := 'worker';
  end if;

  select lower(email)
  into current_email
  from auth.users
  where id = current_user_id;

  if current_email is null then
    raise exception '이메일을 확인할 수 없는 계정입니다.';
  end if;

  insert into public.access_requests (email, name, requested_role, status, reviewed_by, reviewed_at)
  values (current_email, nullif(request_name, ''), normalized_role, 'pending', null, null)
  on conflict (email)
  do update set
    name = coalesce(nullif(excluded.name, ''), public.access_requests.name),
    requested_role = excluded.requested_role,
    status = 'pending',
    reviewed_by = null,
    reviewed_at = null,
    updated_at = now();
end;
$$;

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
  file_paths text[];
begin
  if not public.is_admin() then
    raise exception '관리자 권한이 필요합니다.';
  end if;

  select coalesce(array_agg(file_path), array[]::text[])
  into file_paths
  from public.customer_documents
  where customer_id = target_customer_id;

  delete from public.customers
  where id = target_customer_id;

  if not found then
    raise exception '삭제할 제출 건을 찾을 수 없습니다.';
  end if;

  return file_paths;
end;
$$;

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

drop trigger if exists touch_access_requests_updated_at on public.access_requests;
create trigger touch_access_requests_updated_at
before update on public.access_requests
for each row
execute function public.touch_updated_at();

drop trigger if exists touch_customer_delete_requests_updated_at on public.customer_delete_requests;
create trigger touch_customer_delete_requests_updated_at
before update on public.customer_delete_requests
for each row
execute function public.touch_updated_at();

alter table public.access_requests enable row level security;
alter table public.customer_delete_requests enable row level security;

grant select, insert, update on public.login_allowlist to authenticated;
grant select, update on public.access_requests to authenticated;
grant select, update on public.customer_delete_requests to authenticated;
grant execute on function public.submit_access_request(text, text) to authenticated;
grant execute on function public.sync_profile_from_allowlist(text) to authenticated;
grant execute on function public.delete_customer_submission(uuid) to authenticated;
grant execute on function public.request_customer_delete(uuid, text) to authenticated;
grant execute on function public.update_customer_worker_progress(uuid, text, text, text, text, text, text) to authenticated;
grant execute on function public.update_worker_display_name(uuid, text) to authenticated;

drop policy if exists "login_allowlist_select_own_or_admin" on public.login_allowlist;
create policy "login_allowlist_select_own_or_admin"
on public.login_allowlist
for select
to authenticated
using (
  lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or public.has_admin_access()
);

drop policy if exists "login_allowlist_admin_insert" on public.login_allowlist;
create policy "login_allowlist_admin_insert"
on public.login_allowlist
for insert
to authenticated
with check (
  public.is_admin()
  or (
    public.is_sub_admin()
    and role = 'worker'
    and active = true
  )
);

drop policy if exists "login_allowlist_admin_update" on public.login_allowlist;
create policy "login_allowlist_admin_update"
on public.login_allowlist
for update
to authenticated
using (
  public.is_admin()
  or (
    public.is_sub_admin()
    and role = 'worker'
  )
)
with check (
  public.is_admin()
  or (
    public.is_sub_admin()
    and role = 'worker'
    and active = true
  )
);

drop policy if exists "access_requests_select_own_or_admin" on public.access_requests;
create policy "access_requests_select_own_or_admin"
on public.access_requests
for select
to authenticated
using (
  lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or public.has_admin_access()
);

drop policy if exists "access_requests_admin_update" on public.access_requests;
create policy "access_requests_admin_update"
on public.access_requests
for update
to authenticated
using (
  public.is_admin()
  or (
    public.is_sub_admin()
    and requested_role = 'worker'
  )
)
with check (
  public.is_admin()
  or (
    public.is_sub_admin()
    and requested_role = 'worker'
  )
);

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles
for select
to authenticated
using (id = auth.uid() or public.has_admin_access());

drop policy if exists "customers_select_assigned_worker_or_admin" on public.customers;
create policy "customers_select_assigned_worker_or_admin"
on public.customers
for select
to authenticated
using (assigned_worker_id = auth.uid() or public.has_admin_access());

drop policy if exists "customers_admin_update" on public.customers;
create policy "customers_admin_update"
on public.customers
for update
to authenticated
using (public.has_admin_access())
with check (public.has_admin_access());

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

drop policy if exists "customer_documents_select_worker_or_admin" on public.customer_documents;
create policy "customer_documents_select_worker_or_admin"
on public.customer_documents
for select
to authenticated
using (uploaded_by = auth.uid() or public.has_admin_access());

drop policy if exists "customer_documents_delete_worker_or_admin" on public.customer_documents;
create policy "customer_documents_delete_worker_or_admin"
on public.customer_documents
for delete
to authenticated
using (uploaded_by = auth.uid() or public.has_admin_access());

drop policy if exists "storage_documents_select_owner_or_admin" on storage.objects;
create policy "storage_documents_select_owner_or_admin"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'customer-documents'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.has_admin_access()
  )
);

drop policy if exists "storage_documents_delete_owner_or_admin" on storage.objects;
create policy "storage_documents_delete_owner_or_admin"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'customer-documents'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.has_admin_access()
  )
);

notify pgrst, 'reload schema';
