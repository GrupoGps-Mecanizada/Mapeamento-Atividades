# Login, Tarefas Diárias e Filtro Excel — Design

Data: 2026-09-22
Escopo: `index.html`, `app.js` + novos módulos puros + migrações no Supabase (projeto `mfsyrsegkvjmefcdaegh`, "PRODUTIVIDADE").
Fora do escopo: `Central de Problemas.dc.html`, `support.js`. As tabelas `demoras_categorizadas`, `timeline_motor_vaga`, `alert_rules`, `alert_instances` pertencem a outro sistema no mesmo projeto Supabase e não são tocadas.

Decomposto em 3 sub-projetos, entregues nesta ordem (motivo em cada seção):

1. **Filtro/ordenação estilo Excel** — independente, sem mudança de banco.
2. **Login** — trava de verdade no banco; entrega em fases para nunca deixar o time sem acesso.
3. **Tarefas diárias** — depende do login (lista é por pessoa logada).

---

## 1. Filtro e ordenação estilo Excel

Substitui os 3 `<select>` acima da tabela (`#filters-bar`) por filtros no próprio cabeçalho.

### Colunas com filtro
Setor, Criticidade, Status, Responsável, Aberto por. Título continua usando a busca do topo (já existente); Prazo fica sem filtro de valores (datas quase sempre únicas).

### Comportamento
- Ícone de funil ao lado do rótulo de cada coluna filtrável. Clique abre um painel (`.col-filter-panel`, `position:absolute`, ancorado no `<th>`):
  - "Selecionar tudo" / "Limpar"
  - lista de valores distintos **presentes no resultado já filtrado pelas outras colunas e pela busca** (semântica igual ao Excel: os filtros se combinam), cada um com contagem
  - botões **OK** (aplica) / **Cancelar** (descarta) — só aplica ao confirmar, igual ao Excel
  - o funil fica destacado quando a coluna tem filtro ativo
- Clique no **nome** da coluna (fora do ícone) ordena por ela; clique de novo inverte. Um indicador ▲/▼ mostra a coluna e direção ativas.
  - Criticidade ordena por severidade (Baixa → Média → Alta), não alfabeticamente.
  - Status ordena pelo ciclo de vida (Aberto → Em andamento → Aguardando terceiros → Resolvido → Cancelado), não alfabeticamente.
  - As demais colunas ordenam alfabeticamente/por data. Prazo sem valor vai sempre por último, em qualquer direção.
  - Padrão inicial (sem clique ainda): Prazo crescente, como hoje.
- **Celular:** cabeçalho de tabela não aparece (a lista vira cartões). Um botão **"Filtros"** (onde hoje fica `#filters-bar`) abre um painel em tela cheia com as 5 colunas em blocos (mesma lista de checkboxes) e um controle "Ordenar por" (coluna + crescente/decrescente), com "Aplicar" e "Limpar filtros".

### Modelo de dados (em memória, sem banco)
```js
state.colFilters = { setor: null, criticidade: null, status: null, responsavel_id: null, aberto_por_id: null }; // Set<string> | null (null = sem filtro)
state.sort = { col: 'prazo', dir: 'asc' };
```
`getFiltered()` passa a aplicar `colFilters` (além dos filtros de busca já existentes) e ordenar pelo comparador de `state.sort.col`.

### Arquivos
- `tabela.js` (novo, módulo puro testável em Node, mesmo padrão do `anexos.js`): comparadores de ordenação (`compareCriticidade`, `compareStatus`, comparador genérico), `applyColFilters(rows, filters)`, `buildFilterOptions(rows, campo)` (valores distintos + contagem).
- `index.html`: ícones/painel nos `<th>`, remoção do `#filters-bar` atual, painel mobile novo.
- `app.js`: estado `colFilters`/`sort`, abrir/fechar painel (clique fora e Esc fecham), render dos painéis, `renderLista()` usando `tabela.js`.

---

## 2. Login

### Por que isso é uma mudança de segurança, não só de tela
Hoje as regras (RLS) do Supabase liberam leitura e escrita **total** para a chave pública (`anon`), que está no `app.js` do repositório, em `problemas`, `pessoas`, `setores` e no bucket `anexos-problemas`. Uma tela de login sozinha não muda isso — quem tiver a chave (pública, no GitHub) continua conseguindo ler/alterar tudo direto pela API, ignorando a tela. Por isso o login inclui travar as regras do banco para exigir sessão válida, não é só interface.

### Contas
- Supabase Auth (e-mail + senha nativos do Supabase), uma conta por pessoa.
- `pessoas` ganha:
  - `auth_user_id uuid unique references auth.users(id) on delete set null` — liga a pessoa à conta.
  - `role text not null default 'membro' check (role in ('membro','admin'))`.
- Admin inicial: Warlison Abreu (`warlison.abreu@gestaogps.com.br`).
- **Como as contas são criadas:** eu não tenho (e não devo ter) a chave secreta (`service_role`) do projeto — só ela pode criar contas, e colocá-la em qualquer lugar que eu leia seria um risco de segurança. Por isso: eu escrevo um script local (`scripts/convidar-contas.js`, com a lista de nome+e-mail num arquivo `scripts/pessoas-emails.local.json` que **não vai para o Git**) que usa `supabase.auth.admin.inviteUserByEmail(...)` — a mesma função que o botão "Invite" do painel do Supabase usa. Você roda esse script uma vez, na sua máquina, com a chave secreta (pegue em Project Settings → API → service_role) numa variável de ambiente que só existe no seu terminal. Eu nunca vejo essa chave. O script dispara, para cada pessoa, o e-mail padrão do Supabase para criar a própria senha.
  - Alternativa manual, sem rodar script: painel do Supabase → Authentication → Users → "Add user" → "Send invite email", um de cada vez. Mais lento (8 cliques), mas sem precisar rodar nada local.
  - Se algum e-mail não chegar (provedor bloqueando), dá para reenviar pelo próprio painel do Supabase.

### Depois de logado
- Removidos dos formulários: o menu "Aberto por" (novo problema) e o menu "quem está comentando". Os dois passam a ser sempre a pessoa logada, automaticamente.
- "Responsável" (a quem o problema é atribuído) continua sendo um menu — pode ser atribuído a qualquer pessoa.
- Cabeçalho: onde ficava "Você é", passa a mostrar o nome de quem está logado + link "Sair".
- Tela de login: e-mail + senha + "Entrar", link "Esqueci minha senha" (`resetPasswordForEmail`), sem cadastro público. Enquanto não há sessão válida e vinculada a uma pessoa, o resto do app (`#app`) fica oculto.
- Se a conta logada existir no Supabase Auth mas ainda não estiver vinculada a nenhuma linha de `pessoas` (`auth_user_id` ainda não setado), mostra erro claro ("Sua conta ainda não foi vinculada. Fale com o administrador.") e desloga — nunca deixa entrar num estado incompleto.

### Permissões (RLS)
- Qualquer pessoa logada **e vinculada** (tem linha em `pessoas` com `auth_user_id = auth.uid()`): lê tudo, cria problemas (só pode abrir em next nome próprio — `aberto_por_id` tem que ser o dela), edita/comenta qualquer problema, envia/remove anexos.
- Só **admin**: exclui problemas; cria/edita/remove setores; cria/edita/remove pessoas (inclui promover/rebaixar `role`).
- Duas funções `security definer` evitam o erro clássico de recursão de RLS (uma política em `pessoas` que consulta `pessoas` dispara a si mesma):
  ```sql
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
  ```
- SQL exato da trava final (fase 4 — remove as políticas abertas para `anon`, cria as novas restritas a `authenticated` + vinculado):
  ```sql
  drop policy "allow read/write for dashboard" on public.pessoas;
  create policy "pessoas select linked" on public.pessoas for select to authenticated
    using (current_pessoa_id() is not null);
  create policy "pessoas admin insert" on public.pessoas for insert to authenticated
    with check (is_admin());
  create policy "pessoas admin update" on public.pessoas for update to authenticated
    using (is_admin()) with check (is_admin());
  create policy "pessoas admin delete" on public.pessoas for delete to authenticated
    using (is_admin());

  drop policy "allow read/write for dashboard" on public.setores;
  create policy "setores select linked" on public.setores for select to authenticated
    using (current_pessoa_id() is not null);
  create policy "setores admin insert" on public.setores for insert to authenticated
    with check (is_admin());
  create policy "setores admin update" on public.setores for update to authenticated
    using (is_admin()) with check (is_admin());
  create policy "setores admin delete" on public.setores for delete to authenticated
    using (is_admin());

  drop policy "allow read/write for dashboard" on public.problemas;
  create policy "problemas select linked" on public.problemas for select to authenticated
    using (current_pessoa_id() is not null);
  create policy "problemas insert linked" on public.problemas for insert to authenticated
    with check (current_pessoa_id() is not null and aberto_por_id = current_pessoa_id());
  create policy "problemas update linked" on public.problemas for update to authenticated
    using (current_pessoa_id() is not null) with check (current_pessoa_id() is not null);
  create policy "problemas admin delete" on public.problemas for delete to authenticated
    using (is_admin());

  drop policy "anexos-problemas select" on storage.objects;
  drop policy "anexos-problemas insert" on storage.objects;
  drop policy "anexos-problemas delete" on storage.objects;
  create policy "anexos-problemas select linked" on storage.objects for select to authenticated
    using (bucket_id = 'anexos-problemas' and current_pessoa_id() is not null);
  create policy "anexos-problemas insert linked" on storage.objects for insert to authenticated
    with check (bucket_id = 'anexos-problemas' and current_pessoa_id() is not null);
  create policy "anexos-problemas delete linked" on storage.objects for delete to authenticated
    using (bucket_id = 'anexos-problemas' and current_pessoa_id() is not null);
  ```
  A política de inserção em `problemas` exige `aberto_por_id = current_pessoa_id()`: ninguém consegue abrir um problema em nome de outra pessoa, mesmo alterando a requisição manualmente.
- Interface: os botões de excluir problema, adicionar/remover setor, adicionar/remover pessoa e o seletor de papel só aparecem se `state.me.role === 'admin'` (a trava real continua sendo a RLS; isso é só para não mostrar botão que vai falhar).

### Entrega em fases (para nunca travar o time fora do sistema)

1. **Schema aditivo** (`auth_user_id`, `role`, as duas funções) — não muda nenhuma regra de acesso ainda. App continua funcionando exatamente como hoje.
2. **Criação das contas** (script local, seção acima) + eu ligo `auth_user_id` de cada pessoa pelo e-mail (via SQL, comparando com `auth.users.email`) e marco Warlison como `admin`. Confirmo por consulta que as 8 contas existem e estão ligadas.
3. **Frontend novo** (tela de login, identidade automática, UI admin-gated) publicado — ainda com as regras antigas (`anon` liberado) por baixo, como rede de segurança: se algo no login quebrar, os dados continuam acessíveis para eu corrigir sem ninguém ficar na mão.
4. **Trava final:** só depois de confirmar que o login funciona (pelo menos o admin faz um teste real), eu removo as políticas antigas (`anon`) e aplico as novas (`authenticated` + vinculado). **Esse é o passo que não tem volta fácil** — confirmo com você antes de rodar, mesmo já com o design aprovado.

### Como eu vou verificar sem saber a senha de ninguém
Eu não posso logar como nenhuma pessoa real (não tenho e não devo ter senhas de ninguém). Por isso:
- As regras de acesso (quem pode ler/escrever o quê) são testadas **diretamente no banco**, simulando cada papel via SQL (`set local role authenticated; select set_config('request.jwt.claims', ...)`), que é a forma padrão de testar RLS do Supabase sem precisar de uma sessão de verdade.
- A lógica da tela de login (mostrar/esconder, mensagens de erro, o que acontece depois de logar) é revisada no código e testada com um cliente Supabase simulado (sem bater no servidor).
- O clique real "entrar com e-mail e senha" só pode ser testado por uma pessoa de verdade — no fim, peço que você (Warlison) faça esse teste com sua própria conta.

---

## 3. Tarefas diárias

Nova aba **Tarefas**, ao lado de Lista/Dashboard/Configurações. Cada pessoa só vê e mexe nas próprias tarefas (depende do login).

### Banco
```sql
create table public.tarefas (
  id uuid primary key default gen_random_uuid(),
  pessoa_id uuid not null references public.pessoas(id) on delete cascade,
  texto text not null,
  rotineira boolean not null default false,
  concluida_em date,               -- null = pendente. Preenchida = feita (nessa data, se rotineira).
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
```
Tabela nova, criada já com RLS restrita a `authenticated` — não existe versão "aberta" dela para quebrar compatibilidade.

### Regra de "reinicia todo dia" sem rodar nenhum job
Um único campo (`concluida_em`) serve para os dois tipos de tarefa, comparado com a data local de hoje na hora de desenhar a tela:
- **Rotineira:** aparece marcada hoje só se `concluida_em == hoje`. Marcar grava `hoje`; desmarcar limpa. Amanhã, sem nenhuma ação em segundo plano, ela já aparece desmarcada de novo (porque `concluida_em` não é mais igual a "hoje").
- **Não rotineira (contínua):** aparece marcada se `concluida_em` tem qualquer valor, não importa qual data. Fica assim até você desmarcar ou excluir.

### Interface ("estilo Notion", com escopo explícito)
Duas listas na aba: **Rotineiras** e **Outras tarefas**. Cada uma é uma lista editável em linha:
- Cada linha: caixinha de marcar + texto + (ao passar o mouse/tocar) ícone de "tornar rotineira" e "excluir".
- Digitar e apertar **Enter** cria a próxima linha logo abaixo e já foca nela (sem precisar clicar em "Adicionar").
- Marcar risca o texto (`text-decoration: line-through`) e esmaece a cor.
- Salva sozinho (sem botão "Salvar"): o texto salva ao perder o foco ou parar de digitar por um instante; marcar/desmarcar e mudar "rotineira" salvam na hora.
- Nova tarefa entra na posição em que o Enter foi apertado (não sempre no fim), usando uma "ordem" numérica fracionária: ao inserir entre duas linhas, a nova recebe a média das ordens vizinhas.
- **Não incluído nesta versão** (para não estourar o escopo): sub-tarefas, arrastar para reordenar, formatação de texto, anexos ou comentários nas tarefas, notificações. Pode entrar depois se fizer falta.

### Arquivos
- Migração `supabase/migrations/<timestamp>_tarefas.sql`.
- `tarefas.js` (novo módulo puro, testável em Node): `todayLocal()`, `estaConcluidaHoje(tarefa)`, `ordemEntre(ordemAnterior, ordemSeguinte)`.
- `index.html`: aba nova, `#view-tarefas` com as duas listas.
- `app.js`: CRUD de tarefas, render da lista editável, handlers de teclado (Enter/Backspace), toggle rotineira, debounce de salvamento de texto.

---

## Verificação (visão geral)

- **Excel filtro/ordenação:** testes unitários de `tabela.js` (comparadores, contagem de opções); E2E no navegador (sem gravar no banco) conferindo que marcar/desmarcar valores filtra a lista e que clicar no cabeçalho ordena; captura visual em desktop e celular.
- **Login:** verificação de RLS por simulação de papel via SQL (ver seção 2); revisão de código da tela de login; teste manual final feito por você (Warlison) com sua conta real.
- **Tarefas:** testes unitários de `tarefas.js`; verificação de RLS por simulação de papel (cada pessoa só vê as próprias tarefas); E2E de interface (criar, marcar, tornar rotineira, excluir) simulando a sessão via SQL para preparar dados, já que não tenho senha real para logar de verdade.

## Entrega

- Branch `login-tarefas-filtro`, a partir do `master` atualizado.
- Ordem de commits/tasks segue a ordem das 3 seções acima (Excel primeiro, depois login em fases, depois tarefas).
- **Pendência bloqueante antes da Fase 2 do login:** preciso do e-mail de trabalho de Donizete, Icaro Bernardo, Jonathan Henrique, Junior Pereira, Ramon, Rebeca e Warlison Abreu (esse já tenho: `warlison.abreu@gestaogps.com.br`).
- Nenhum `git push` sem confirmação. A trava final de RLS (fase 4 do login) pede confirmação separada, mesmo com este design aprovado.
