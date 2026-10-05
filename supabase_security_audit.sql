-- Read-only audit. Run in Supabase SQL Editor before applying the hardening migration.
-- Results contain schema/security metadata, not financial records or session tokens.
select current_database() as database_name, current_user as execution_role;

select c.relname as table_name, c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('profiles', 'financial_data');

select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies where schemaname = 'public'
  and tablename in ('profiles', 'financial_data') order by tablename, policyname;

select table_name, grantee, privilege_type
from information_schema.table_privileges
where table_schema = 'public' and table_name in ('profiles', 'financial_data')
  and grantee in ('PUBLIC', 'anon', 'authenticated')
order by table_name, grantee, privilege_type;

select table_name,column_name,grantee,privilege_type
from information_schema.column_privileges
where table_schema='public' and table_name in ('profiles','financial_data')
  and grantee in ('PUBLIC','anon','authenticated')
order by table_name,column_name,grantee,privilege_type;

select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name in ('profiles', 'financial_data')
order by table_name, ordinal_position;

select c.conrelid::regclass as table_name, c.conname, pg_get_constraintdef(c.oid) as definition
from pg_constraint c
where c.conrelid in (coalesce(to_regclass('public.profiles'),0::oid), coalesce(to_regclass('public.financial_data'),0::oid));

-- Exposed views and privileged functions deserve separate review: they can bypass RLS.
select c.relname as view_name, c.reloptions
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('v','m');

select p.oid::regprocedure as function_name, p.prosecdef as security_definer,
       p.proconfig as settings, p.proacl as grants
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef;
