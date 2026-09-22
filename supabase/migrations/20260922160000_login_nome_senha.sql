-- MAPEAMENTO DE ATIVIDADES — volta a login simples (nome + senha)
-- Remove a restricao de dominio de e-mail: as contas agora sao criadas pelo
-- admin direto no painel do Supabase, com enderecos ficticios
-- <primeiro-nome>@mecanizada.com (a pessoa digita so o primeiro nome na tela).
-- O gatilho de ligar/criar pessoa (handle_new_user) continua valendo, pois
-- tambem serve para contas criadas assim pelo painel.

drop trigger if exists enforce_email_domain on auth.users;
drop function if exists public.check_email_domain();
