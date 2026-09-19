-- Ensure the security-definer deposit RPC can update the user's wallet.
-- This repairs projects where the function owner does not retain table grants.

alter function public.submit_deposit(numeric, text, text, text, text, text) security definer;
grant execute on function public.submit_deposit(numeric, text, text, text, text, text) to authenticated;

do $$
declare
  function_owner name;
begin
  select pg_get_userbyid(proowner)
    into function_owner
  from pg_proc
  where oid = 'public.submit_deposit(numeric, text, text, text, text, text)'::regprocedure;

  execute format('grant usage on schema public to %I', function_owner);
  execute format('grant select on public.wallet_addresses to %I', function_owner);
  execute format('grant select, insert on public.deposits to %I', function_owner);
  execute format('grant select, update on public.wallets to %I', function_owner);
end $$;