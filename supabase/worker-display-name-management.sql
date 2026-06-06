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
