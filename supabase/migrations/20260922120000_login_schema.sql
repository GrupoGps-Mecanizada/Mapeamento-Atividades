-- MAPEAMENTO DE ATIVIDADES — schema de login
-- Aditiva: nao muda nenhuma politica de acesso ainda (anon continua liberado).
-- A trava final vem na migracao 20260922130000_login_rls.sql, so depois
-- que as contas existirem e o login tiver sido testado.

alter table public.pessoas
  add column auth_user_id uuid unique references auth.users(id) on delete set null,
  add column role text not null default 'membro' check (role in ('membro','admin'));

create or replace function public.current_pessoa_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.pessoas where auth_user_id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.pessoas where auth_user_id = auth.uid() and role = 'admin');
$$;

revoke all on function public.current_pessoa_id() from public;
revoke all on function public.is_admin() from public;
grant execute on function public.current_pessoa_id() to authenticated;
grant execute on function public.is_admin() to authenticated;
