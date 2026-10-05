-- Run AFTER hardening, in SQL Editor, using TWO confirmed test accounts.
-- Replace the two UUIDs below. No passwords/tokens are needed.
-- All fixtures/updates are rolled back; existing financial JSON is not replaced.
begin;
select set_config('orgfinan.test_a','00000000-0000-0000-0000-000000000001',true);
select set_config('orgfinan.test_b','00000000-0000-0000-0000-000000000002',true);

do $$
declare a uuid := current_setting('orgfinan.test_a')::uuid;
        b uuid := current_setting('orgfinan.test_b')::uuid;
begin
  if a=b or (select count(*) from auth.users where id in (a,b))<>2 then
    raise exception 'Substitua os UUIDs por duas contas de teste existentes.';
  end if;
end;
$$;

insert into public.financial_data(user_id,data)
select id,'{}'::jsonb from auth.users
where id in (current_setting('orgfinan.test_a')::uuid,current_setting('orgfinan.test_b')::uuid)
on conflict(user_id) do nothing;
insert into public.profiles(id,email,name)
select id,email,'RLS test' from auth.users
where id in (current_setting('orgfinan.test_a')::uuid,current_setting('orgfinan.test_b')::uuid)
on conflict(id) do nothing;

set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);
do $$
begin
  begin
    perform 1 from public.financial_data limit 1;
    raise exception 'FAIL: anon tem SELECT em financial_data';
  exception when insufficient_privilege then raise notice 'PASS: anon sem SELECT financeiro'; end;
  begin
    perform 1 from public.profiles limit 1;
    raise exception 'FAIL: anon tem SELECT em profiles';
  exception when insufficient_privilege then raise notice 'PASS: anon sem SELECT em profiles'; end;
end;
$$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('orgfinan.test_b'),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('orgfinan.test_b'),'role','authenticated')::text,true);
do $$
declare a uuid := current_setting('orgfinan.test_a')::uuid;
        b uuid := current_setting('orgfinan.test_b')::uuid;
        affected integer;
begin
  if (select count(*) from public.financial_data where user_id=b)<>1 then raise exception 'FAIL: conta B nao consegue ler seus dados'; end if;
  if exists(select 1 from public.financial_data where user_id=a) then raise exception 'FAIL: B consegue ler A'; end if;
  if exists(select 1 from public.profiles where id=a) then raise exception 'FAIL: B consegue ler perfil A'; end if;
  raise notice 'PASS: leitura isolada por conta nas duas tabelas';

  update public.financial_data set data=data where user_id=b;
  get diagnostics affected = row_count;
  if affected<>1 then raise exception 'FAIL: B nao consegue atualizar seus dados'; end if;
  update public.financial_data set data=data where user_id=a;
  get diagnostics affected = row_count;
  if affected<>0 then raise exception 'FAIL: B consegue atualizar A'; end if;
  raise notice 'PASS: UPDATE financeiro isolado';

  begin
    insert into public.financial_data(user_id,data) values(a,'{}')
      on conflict(user_id) do update set data=excluded.data;
    raise exception 'FAIL: B consegue fazer upsert em nome de A';
  exception when insufficient_privilege then raise notice 'PASS: upsert cruzado negado'; end;

  begin
    insert into public.profiles(id,name) values(a,'RLS test')
      on conflict(id) do update set name=excluded.name;
    raise exception 'FAIL: B consegue alterar perfil A';
  exception when insufficient_privilege then raise notice 'PASS: perfil cruzado negado'; end;

  begin
    delete from public.financial_data where user_id=b;
    raise exception 'FAIL: cliente tem DELETE financeiro desnecessario';
  exception when insufficient_privilege then raise notice 'PASS: DELETE desnecessario negado'; end;
end;
$$;
reset role;
rollback;
