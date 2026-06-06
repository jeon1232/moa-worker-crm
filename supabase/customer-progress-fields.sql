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

notify pgrst, 'reload schema';
