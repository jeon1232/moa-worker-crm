create table if not exists public.login_allowlist (
  email text primary key,
  name text,
  role text check (role in ('admin', 'worker')) not null default 'worker',
  active boolean not null default true,
  created_at timestamptz default now()
);

alter table public.profiles
add column if not exists kakao_display_name text;

alter table public.login_allowlist enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.login_allowlist to authenticated;
grant select, insert, update on public.customers to authenticated;
grant select, insert, delete on public.customer_documents to authenticated;

drop policy if exists "login_allowlist_select_own_or_admin" on public.login_allowlist;
create policy "login_allowlist_select_own_or_admin"
on public.login_allowlist
for select
to authenticated
using (
  lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or public.is_admin()
);

drop policy if exists "login_allowlist_admin_insert" on public.login_allowlist;
create policy "login_allowlist_admin_insert"
on public.login_allowlist
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "login_allowlist_admin_update" on public.login_allowlist;
create policy "login_allowlist_admin_update"
on public.login_allowlist
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "profiles_insert_own" on public.profiles;
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

drop policy if exists "profiles_update_own_name" on public.profiles;
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

notify pgrst, 'reload schema';

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
