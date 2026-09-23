-- MAPEAMENTO DE ATIVIDADES — agenda de reuniões, palestras etc.
-- Mesmo nível de acesso aberto que problemas/pessoas/setores/tarefas hoje.

create table public.agendamentos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  tipo text not null default 'Reunião' check (tipo in ('Reunião','Palestra','Outro')),
  data date not null,
  hora_inicio time not null,
  hora_fim time,
  local text,
  responsavel_id uuid references public.pessoas(id) on delete set null,
  descricao text,
  criado_em timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index agendamentos_data_idx on public.agendamentos(data);

alter table public.agendamentos enable row level security;
create policy "agendamentos select" on public.agendamentos for select to anon, authenticated using (true);
create policy "agendamentos insert" on public.agendamentos for insert to anon, authenticated with check (true);
create policy "agendamentos update" on public.agendamentos for update to anon, authenticated using (true) with check (true);
create policy "agendamentos delete" on public.agendamentos for delete to anon, authenticated using (true);
