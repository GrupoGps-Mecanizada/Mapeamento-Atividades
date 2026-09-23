-- MAPEAMENTO DE ATIVIDADES — warlison@mecanizada.com sempre admin
-- handle_new_user() gravava role='membro' para toda conta nova, sem excecao,
-- entao o admin do sistema ficava sem papel admin sempre que a conta fosse
-- recriada (ja aconteceu ao religar o login). Daqui pra frente, a conta
-- warlison@mecanizada.com sempre nasce (ou e corrigida, se ja existir a
-- pessoa) com role='admin'; qualquer outro e-mail continua 'membro' como
-- antes.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_pessoa_id uuid;
  v_role text := case when lower(NEW.email) = 'warlison@mecanizada.com' then 'admin' else 'membro' end;
begin
  select id into v_pessoa_id from public.pessoas
    where lower(email) = lower(NEW.email) and auth_user_id is null
    limit 1;
  if v_pessoa_id is not null then
    update public.pessoas set auth_user_id = NEW.id, role = v_role where id = v_pessoa_id;
  else
    insert into public.pessoas (id, nome, setor, email, auth_user_id, role)
    values (
      gen_random_uuid(),
      coalesce(nullif(trim(NEW.raw_user_meta_data->>'nome'), ''), split_part(NEW.email, '@', 1)),
      '', NEW.email, NEW.id, v_role
    );
  end if;
  return NEW;
end;
$$;

-- Corrige agora a conta que ja existe (criada antes desta migracao com
-- role='membro'). O login atual usa nome -> e-mail ficticio via auth.users,
-- nao a coluna "email" de public.pessoas, entao o vinculo e por auth_user_id.
update public.pessoas
  set role = 'admin'
  where role <> 'admin'
    and auth_user_id in (select id from auth.users where lower(email) = 'warlison@mecanizada.com');
