alter table public.customers
add column if not exists qr_billed boolean default false;

update public.customers
set qr_billed = coalesce(qr_billed, false);

notify pgrst, 'reload schema';
