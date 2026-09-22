-- MAPEAMENTO DE ATIVIDADES — tarefas sem login real
-- Sem Supabase Auth ativo, as politicas "to authenticated" bloqueavam
-- qualquer acesso (a chave publica do app usa o papel anon). Abre para
-- anon, no mesmo nivel de acesso que problemas/pessoas/setores ja tem
-- hoje neste app. O isolamento por pessoa passa a ser so na tela
-- (filtra por pessoa_id = "Você é" escolhido), sem trava real no banco.

drop policy if exists "tarefas select own" on public.tarefas;
drop policy if exists "tarefas insert own" on public.tarefas;
drop policy if exists "tarefas update own" on public.tarefas;
drop policy if exists "tarefas delete own" on public.tarefas;

create policy "tarefas select" on public.tarefas for select to anon, authenticated using (true);
create policy "tarefas insert" on public.tarefas for insert to anon, authenticated with check (true);
create policy "tarefas update" on public.tarefas for update to anon, authenticated using (true) with check (true);
create policy "tarefas delete" on public.tarefas for delete to anon, authenticated using (true);
