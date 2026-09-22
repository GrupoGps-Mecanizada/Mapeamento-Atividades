-- MAPEAMENTO DE ATIVIDADES — conta autoatendimento (domínio da empresa)
-- Qualquer pessoa com e-mail @gestaogps.com.br ou @gpssa.com.br pode criar a
-- própria conta pela tela de login. Dois gatilhos em auth.users:
--   1) recusa a criacao se o e-mail nao for do dominio da empresa (trava no banco).
--   2) liga a conta a uma pessoa ja cadastrada com esse e-mail (identificacao/historico);
--      se nao houver, cria uma pessoa nova (papel "membro", sem setor definido).

alter table public.pessoas add column email text unique;

create or replace function public.check_email_domain()
returns trigger language plpgsql as $$
begin
  if NEW.email !~* '@(gestaogps\.com\.br|gpssa\.com\.br)$' then
    raise exception 'Cadastro permitido apenas para e-mails da empresa (@gestaogps.com.br ou @gpssa.com.br).';
  end if;
  return NEW;
end;
$$;

create trigger enforce_email_domain
before insert on auth.users
for each row execute function public.check_email_domain();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_pessoa_id uuid;
begin
  select id into v_pessoa_id from public.pessoas
    where lower(email) = lower(NEW.email) and auth_user_id is null
    limit 1;
  if v_pessoa_id is not null then
    update public.pessoas set auth_user_id = NEW.id where id = v_pessoa_id;
  else
    insert into public.pessoas (id, nome, setor, email, auth_user_id, role)
    values (
      gen_random_uuid(),
      coalesce(nullif(trim(NEW.raw_user_meta_data->>'nome'), ''), split_part(NEW.email, '@', 1)),
      '', NEW.email, NEW.id, 'membro'
    );
  end if;
  return NEW;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
