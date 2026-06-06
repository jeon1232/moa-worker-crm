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

grant execute on function public.sync_profile_from_allowlist(text) to authenticated;

notify pgrst, 'reload schema';
