create extension if not exists "pgcrypto";

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  kakao_display_name text,
  role text check (role in ('admin', 'sub_admin', 'worker')) default 'worker',
  created_at timestamptz default now()
);

create table public.login_allowlist (
  email text primary key,
  name text,
  role text check (role in ('admin', 'sub_admin', 'worker')) not null default 'worker',
  active boolean not null default true,
  constraint login_allowlist_privileged_active_check check (role = 'worker' or active = true),
  created_at timestamptz default now()
);

create table public.access_requests (
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

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  business_no text,
  address text,
  kakao_business_id text,
  kakao_business_password text,
  moa_solution_id text,
  moa_solution_password text,
  selected_option text check (selected_option in ('tablet', 'qr')),
  option_tablet boolean default false,
  option_qr boolean default false,
  business_progress_status text check (business_progress_status in ('진행중', '카카오비즈니스 채널 개설 완료')) default '진행중',
  business_auth_done boolean default false,
  needs_tablet boolean default false,
  tablet_shipped boolean default false,
  tablet_shipped_at timestamptz,
  tablet_billed boolean default false,
  qr_billed boolean default false,
  service_fee_billed boolean default false,
  assigned_worker_id uuid references public.profiles(id),
  status text default '진행중',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.customer_delete_requests (
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

create table public.customer_documents (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete cascade,
  document_type text check (document_type in ('사업자등록증', '신분증')),
  file_path text not null unique,
  uploaded_by uuid references public.profiles(id),
  uploaded_at timestamptz default now()
);

create index customers_assigned_worker_id_idx on public.customers(assigned_worker_id);
create index customer_documents_customer_id_idx on public.customer_documents(customer_id);
create index customer_documents_uploaded_by_idx on public.customer_documents(uploaded_by);
create index access_requests_status_idx on public.access_requests(status);
create index customer_delete_requests_customer_id_idx on public.customer_delete_requests(customer_id);
create unique index customer_delete_requests_one_pending_idx
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

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger touch_customers_updated_at
before update on public.customers
for each row
execute function public.touch_updated_at();

create trigger touch_access_requests_updated_at
before update on public.access_requests
for each row
execute function public.touch_updated_at();

create trigger touch_customer_delete_requests_updated_at
before update on public.customer_delete_requests
for each row
execute function public.touch_updated_at();

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

alter table public.profiles enable row level security;
alter table public.login_allowlist enable row level security;
alter table public.access_requests enable row level security;
alter table public.customers enable row level security;
alter table public.customer_delete_requests enable row level security;
alter table public.customer_documents enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.login_allowlist to authenticated;
grant select, update on public.access_requests to authenticated;
grant select, insert, update on public.customers to authenticated;
grant select, update on public.customer_delete_requests to authenticated;
grant select, insert, delete on public.customer_documents to authenticated;
grant execute on function public.submit_access_request(text, text) to authenticated;
grant execute on function public.sync_profile_from_allowlist(text) to authenticated;
grant execute on function public.delete_customer_submission(uuid) to authenticated;
grant execute on function public.request_customer_delete(uuid, text) to authenticated;
grant execute on function public.update_customer_worker_progress(uuid, text, text, text, text, text, text) to authenticated;
grant execute on function public.update_worker_display_name(uuid, text) to authenticated;

create policy "login_allowlist_select_own_or_admin"
on public.login_allowlist
for select
to authenticated
using (
  lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or public.has_admin_access()
);

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

create policy "access_requests_select_own_or_admin"
on public.access_requests
for select
to authenticated
using (
  lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or public.has_admin_access()
);

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

create policy "profiles_select_own_or_admin"
on public.profiles
for select
to authenticated
using (id = auth.uid() or public.has_admin_access());

create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (
  id = auth.uid()
  and exists (
    select 1
    from public.login_allowlist
    where lower(login_allowlist.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and login_allowlist.role = profiles.role
      and login_allowlist.active = true
  )
);

create policy "profiles_update_own_name"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (
  id = auth.uid()
  and exists (
    select 1
    from public.login_allowlist
    where lower(login_allowlist.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and login_allowlist.role = profiles.role
      and login_allowlist.active = true
  )
);

create policy "profiles_admin_update"
on public.profiles
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "customers_select_assigned_worker_or_admin"
on public.customers
for select
to authenticated
using (assigned_worker_id = auth.uid() or public.has_admin_access());

create policy "customers_insert_assigned_worker"
on public.customers
for insert
to authenticated
with check (assigned_worker_id = auth.uid());

create policy "customers_admin_update"
on public.customers
for update
to authenticated
using (public.has_admin_access())
with check (public.has_admin_access());

create policy "customer_delete_requests_select_worker_or_admin"
on public.customer_delete_requests
for select
to authenticated
using (requested_by = auth.uid() or public.has_admin_access());

create policy "customer_delete_requests_admin_update"
on public.customer_delete_requests
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "customer_documents_select_worker_or_admin"
on public.customer_documents
for select
to authenticated
using (uploaded_by = auth.uid() or public.has_admin_access());

create policy "customer_documents_insert_worker_for_assigned_customer"
on public.customer_documents
for insert
to authenticated
with check (
  uploaded_by = auth.uid()
  and exists (
    select 1 from public.customers
    where customers.id = customer_documents.customer_id
      and customers.assigned_worker_id = auth.uid()
  )
);

create policy "customer_documents_delete_worker_or_admin"
on public.customer_documents
for delete
to authenticated
using (uploaded_by = auth.uid() or public.has_admin_access());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'customer-documents',
  'customer-documents',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

create policy "storage_documents_insert_owner"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'customer-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

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

create or replace function public.apply_allowed_profile()
returns public.profiles
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text;
  current_user_metadata jsonb;
  kakao_name text;
  allowed public.login_allowlist%rowtype;
  saved_profile public.profiles%rowtype;
begin
  if current_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select lower(email), raw_user_meta_data
  into current_email, current_user_metadata
  from auth.users
  where id = current_user_id;

  if current_email is null then
    raise exception '이메일을 확인할 수 없는 계정입니다.';
  end if;

  select *
  into allowed
  from public.login_allowlist
  where lower(email) = current_email
    and active = true;

  if allowed.email is null then
    raise exception '허용 목록에 없는 계정입니다: %', current_email;
  end if;

  kakao_name := coalesce(
    nullif(current_user_metadata ->> 'name', ''),
    nullif(current_user_metadata ->> 'full_name', ''),
    nullif(current_user_metadata ->> 'nickname', ''),
    nullif(current_user_metadata ->> 'preferred_username', ''),
    nullif(current_user_metadata ->> 'user_name', ''),
    current_email
  );

  insert into public.profiles (id, name, kakao_display_name, role)
  values (current_user_id, coalesce(allowed.name, current_email), kakao_name, allowed.role)
  on conflict (id)
  do update set
    name = excluded.name,
    kakao_display_name = coalesce(public.profiles.kakao_display_name, excluded.kakao_display_name),
    role = excluded.role
  returning * into saved_profile;

  return saved_profile;
end;
$$;

grant execute on function public.apply_allowed_profile() to authenticated;

notify pgrst, 'reload schema';
