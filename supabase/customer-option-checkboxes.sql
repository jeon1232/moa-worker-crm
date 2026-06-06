alter table public.customers
add column if not exists option_tablet boolean default false;

alter table public.customers
add column if not exists option_qr boolean default false;

update public.customers
set
  option_tablet = coalesce(option_tablet, false) or coalesce(selected_option = 'tablet', false),
  option_qr = coalesce(option_qr, false) or coalesce(selected_option = 'qr', false);

notify pgrst, 'reload schema';
