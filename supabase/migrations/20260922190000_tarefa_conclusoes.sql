-- MAPEAMENTO DE ATIVIDADES — histórico de tarefas concluídas por data
-- tarefas.concluida_em só guarda a ÚLTIMA data (é sobrescrita a cada toggle,
-- pra rotineira resetar todo dia). Pra "voltar e ver o que foi concluído em
-- qualquer data" (pedido do usuário), precisa de um log append-only separado.
-- Mesmo nível de acesso que tarefas hoje (anon, sem login real ligado).

create table public.tarefa_conclusoes (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references public.tarefas(id) on delete cascade,
  pessoa_id uuid not null references public.pessoas(id) on delete cascade,
  data date not null,
  criado_em timestamptz not null default now(),
  unique (tarefa_id, data)
);
create index tarefa_conclusoes_pessoa_data_idx on public.tarefa_conclusoes(pessoa_id, data);

alter table public.tarefa_conclusoes enable row level security;
create policy "tarefa_conclusoes select" on public.tarefa_conclusoes for select to anon, authenticated using (true);
create policy "tarefa_conclusoes insert" on public.tarefa_conclusoes for insert to anon, authenticated with check (true);
create policy "tarefa_conclusoes delete" on public.tarefa_conclusoes for delete to anon, authenticated using (true);
