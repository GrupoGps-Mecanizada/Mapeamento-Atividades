# MAPEAMENTO DE ATIVIDADES — Grupo GPS Mecanizada

Sistema web para mapeamento de atividades e gestão de problemas operacionais. Permite registrar, acompanhar e resolver problemas por setor, criticidade e responsável, com anexos de imagens e documentos e tarefas diárias pessoais.

## Funcionalidades

- 📊 **Dashboard** (aba padrão) com KPIs por urgência — Vencidos, Críticos em aberto, Abertos, Em andamento, Aguardando terceiros, Resolvidos — e gráficos por setor/criticidade
- 📋 **Lista de problemas** com filtro estilo Excel por coluna (com busca embutida e contagem) e ordenação por clique no cabeçalho
- ✅ **Ciclo de vida completo**: Aberto → Em andamento → Aguardando terceiros → Resolvido / Cancelado
- 💬 **Histórico de comentários** por problema
- 📎 **Anexos** de imagens e documentos (JPG, PNG, WebP, PDF, Word, Excel, PowerPoint e TXT; até 10 MB cada, no máximo 10 por problema)
- ✔️ **Tarefas diárias** pessoais (aba "Tarefas"), com itens rotineiros (desmarcam sozinhos todo dia) e contínuos
- 📱 **Interface responsiva** para celular (lista em cartões, formulário em tela cheia, botão flutuante)
- 🗑️ **Excluir problemas** com confirmação
- ⚙️ **Configuração** de setores e pessoas — só aparece para quem está selecionado como "Warlison Abreu" em "Você é" (ver identidade abaixo)
- ☁️ **Persistência em tempo real** via Supabase

## Identidade ("Você é") — sem login real por enquanto

O sistema não pede login hoje. No cabeçalho, o seletor **"Você é"** define quem está usando o sistema naquele navegador (lembrado ali, sem senha):

- Decide o que aparece pré-selecionado em "Aberto por" e no autor de comentários.
- Decide se a aba **Configurações** aparece (só quando a pessoa selecionada é "Warlison Abreu").
- Decide de quem é a lista na aba **Tarefas** (cada pessoa só vê a que escolheu ser).

Isso é conveniência de interface, **não é segurança de verdade** — a chave pública do app continua liberada para ler/escrever tudo (qualquer um com a chave, pelas ferramentas do navegador, ainda acessa tudo). Um sistema de login de verdade (Supabase Auth, com trava real no banco) já foi construído e está pronto no repositório, só não ligado na interface — ver a seção abaixo.

## Tecnologias

- HTML5 + CSS3 + JavaScript (Vanilla)
- [Supabase](https://supabase.com) — Postgres, Auth e Storage em nuvem
- Google Fonts (Manrope)

## Estrutura do banco de dados

```
problemas  → id, titulo, descricao, setor, criticidade, status, responsavel_id, aberto_por_id, criado_em, prazo, comentarios (JSONB), anexos (JSONB)
pessoas    → id, nome, setor, email, auth_user_id, role (membro | admin)  — as 3 últimas colunas só são usadas se o login (pausado) for religado
setores    → id, nome
tarefas    → id, pessoa_id, texto, rotineira, concluida_em, ordem, criado_em
```

Storage: bucket privado `anexos-problemas` (limite de 10 MB por arquivo, tipos restritos no servidor). Os arquivos ficam em `<id do problema>/<uuid>-<nome>` e são abertos por links temporários de 1 hora.

As migrações (em ordem) estão em `supabase/migrations/`. Precisam estar aplicadas no projeto Supabase antes de publicar a versão do app que as usa.

## Login de verdade (pausado)

Existe um sistema de login completo já construído (Supabase Auth, papéis membro/admin, tela, testes) mas **não está ligado na interface atual** — a aba Configurações e a lista de Tarefas usam hoje o seletor "Você é" (acima), não uma sessão de verdade. Os arquivos continuam no repositório (`auth.js`, as migrações `supabase/migrations/20260922*`) prontos para religar; é só pedir. Resumo de como ele funcionava:

1. O admin cria cada conta direto no painel do Supabase (Authentication → Users → Add user), com e-mail fictício `<primeiro-nome>@mecanizada.com` e senha definida na hora (marcando "Auto Confirm User", sem precisar de e-mail real).
2. Um gatilho no banco liga a conta a uma pessoa já cadastrada com esse e-mail (em Configurações → Pessoas) ou cria uma pessoa nova, papel `membro`.
3. Na tela, a pessoa digitava só o primeiro nome + senha.

Religar exigiria também voltar a política de RLS de `tarefas` para exigir `authenticated` (hoje está aberta para `anon`, ver migração `20260922170000_tarefas_sem_login.sql`) e trocar o gate de Configurações de `isAdmin()` (por nome, em `app.js`) para checar a sessão de verdade.

## Como rodar localmente

Abra o arquivo `index.html` em qualquer servidor HTTP estático (ex: Live Server no VS Code).

O app já está configurado para conectar ao Supabase do projeto Grupo GPS.

## Testes

As funções puras (anexos, filtro/ordenação da tabela, tarefas diárias) têm testes com o runner nativo do Node (18+). `auth.js` também tem testes, mesmo pausado:

```
node --test
```

## Variáveis de ambiente

Veja `.env.example` para referência.
