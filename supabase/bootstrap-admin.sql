insert into public.login_allowlist (email, name, role, active)
values ('wjsvlfdnjs@hanmail.net', '브랜딩로그', 'admin', true)
on conflict (email)
do update set
  name = excluded.name,
  role = 'admin',
  active = true;

alter table public.profiles
add column if not exists kakao_display_name text;

insert into public.profiles (id, name, kakao_display_name, role)
select
  id,
  '브랜딩로그',
  coalesce(
    nullif(raw_user_meta_data ->> 'name', ''),
    nullif(raw_user_meta_data ->> 'full_name', ''),
    nullif(raw_user_meta_data ->> 'nickname', ''),
    nullif(raw_user_meta_data ->> 'preferred_username', ''),
    nullif(raw_user_meta_data ->> 'user_name', ''),
    email
  ),
  'admin'
from auth.users
where lower(email) = lower('wjsvlfdnjs@hanmail.net')
on conflict (id)
do update set
  name = excluded.name,
  kakao_display_name = coalesce(public.profiles.kakao_display_name, excluded.kakao_display_name),
  role = 'admin';

notify pgrst, 'reload schema';
