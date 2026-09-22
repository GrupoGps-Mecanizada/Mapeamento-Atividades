-- MAPEAMENTO DE ATIVIDADES — tarefas diarias
-- Tabela nova; RLS restrita a authenticated desde a criacao (sem versao
-- "aberta" dela para quebrar compatibilidade). Depende das funcoes criadas
-- em 20260922120000_login_schema.sql (current_pessoa_id).

create table public.tarefas (
  id uuid primary key default gen_random_uuid(),
  pessoa_id uuid not null references public.pessoas(id) on delete cascade,
  texto text not null,
  rotineira boolean not null default false,
  concluida_em date,
  ordem double precision not null,
  criado_em timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tarefas_pessoa_idx on public.tarefas(pessoa_id);
alter table public.tarefas enable row level security;

create policy "tarefas select own" on public.tarefas for select to authenticated
  using (pessoa_id = current_pessoa_id());
create policy "tarefas insert own" on public.tarefas for insert to authenticated
  with check (pessoa_id = current_pessoa_id());
create policy "tarefas update own" on public.tarefas for update to authenticated
  using (pessoa_id = current_pessoa_id()) with check (pessoa_id = current_pessoa_id());
create policy "tarefas delete own" on public.tarefas for delete to authenticated
  using (pessoa_id = current_pessoa_id());
