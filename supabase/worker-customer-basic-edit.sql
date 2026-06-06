-- Allow workers to correct basic customer information.
-- Safe to run multiple times in Supabase SQL Editor.

drop function if exists public.update_customer_worker_progress(uuid, text, text, text, text, text, text);
drop function if exists public.update_customer_worker_progress(uuid, text, text, text, text, text, text, text, text, boolean, boolean);

create or replace function public.update_customer_worker_progress(
  target_customer_id uuid,
  customer_address text default null,
  kakao_id text default null,
  kakao_password text default null,
  moa_id text default null,
  moa_password text default null,
  progress_status text default '진행중',
  customer_name text default null,
  phone_number text default null,
  has_option_tablet boolean default null,
  has_option_qr boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_progress text := coalesce(progress_status, '진행중');
  clean_name text := nullif(trim(customer_name), '');
begin
  if current_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if customer_name is not null and clean_name is null then
    raise exception '고객명을 입력하세요.';
  end if;

  if normalized_progress = '사업자 인증 완료' then
    normalized_progress := '진행중';
  end if;

  if normalized_progress not in ('진행중', '카카오비즈니스 채널 개설 완료') then
    raise exception '올바른 진행 상태가 아닙니다.';
  end if;

  update public.customers
  set
    name = coalesce(clean_name, name),
    phone = case
      when phone_number is null then phone
      else nullif(phone_number, '')
    end,
    address = nullif(customer_address, ''),
    kakao_business_id = nullif(kakao_id, ''),
    kakao_business_password = nullif(kakao_password, ''),
    moa_solution_id = nullif(moa_id, ''),
    moa_solution_password = nullif(moa_password, ''),
    selected_option = case
      when has_option_tablet is null and has_option_qr is null then selected_option
      when coalesce(has_option_tablet, false) and not coalesce(has_option_qr, false) then 'tablet'
      when not coalesce(has_option_tablet, false) and coalesce(has_option_qr, false) then 'qr'
      else null
    end,
    option_tablet = coalesce(has_option_tablet, option_tablet, false),
    option_qr = coalesce(has_option_qr, option_qr, false),
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

grant execute on function public.update_customer_worker_progress(uuid, text, text, text, text, text, text, text, text, boolean, boolean) to authenticated;

notify pgrst, 'reload schema';
