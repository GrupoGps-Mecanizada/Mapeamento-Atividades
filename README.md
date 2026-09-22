# MAPEAMENTO DE ATIVIDADES — Grupo GPS Mecanizada

Sistema web para mapeamento de atividades e gestão de problemas operacionais. Permite registrar, acompanhar e resolver problemas por setor, criticidade e responsável, com anexos de imagens e documentos.

## Funcionalidades

- 📋 **Lista de problemas** com filtro estilo Excel (por coluna, com contagem) e ordenação por clique no cabeçalho
- 📊 **Dashboard** com KPIs e gráficos de barras por setor/criticidade
- ✅ **Ciclo de vida completo**: Aberto → Em andamento → Aguardando terceiros → Resolvido / Cancelado
- 💬 **Histórico de comentários** por problema
- 📎 **Anexos** de imagens e documentos (JPG, PNG, WebP, PDF, Word, Excel, PowerPoint e TXT; até 10 MB cada, no máximo 10 por problema)
- 📱 **Interface responsiva** para celular (lista em cartões, formulário em tela cheia, botão flutuante)
- 🗑️ **Excluir problemas** com confirmação
- ⚙️ **Configuração** de setores e pessoas
- ☁️ **Persistência em tempo real** via Supabase

> **Login e tarefas diárias:** foram desenvolvidos (telas, banco, testes) mas estão pausados por enquanto — a interface atual não os usa, para o time finalizar outros ajustes primeiro. Nada foi apagado: veja "Login e contas (pausado)" abaixo para retomar quando quiser.

## Tecnologias

- HTML5 + CSS3 + JavaScript (Vanilla)
- [Supabase](https://supabase.com) — Postgres, Auth e Storage em nuvem
- Google Fonts (Manrope)

## Estrutura do banco de dados

```
problemas  → id, titulo, descricao, setor, criticidade, status, responsavel_id, aberto_por_id, criado_em, prazo, comentarios (JSONB), anexos (JSONB)
pessoas    → id, nome, setor, email, auth_user_id, role (membro | admin)  — as 3 últimas colunas existem no banco mas a interface atual não as usa (ver "Login e contas (pausado)")
setores    → id, nome
tarefas    → id, pessoa_id, texto, rotineira, concluida_em, ordem, criado_em  — tabela existe no banco, sem aba correspondente na interface atual
```

Storage: bucket privado `anexos-problemas` (limite de 10 MB por arquivo, tipos restritos no servidor). Os arquivos ficam em `<id do problema>/<uuid>-<nome>` e são abertos por links temporários de 1 hora.

As migrações (em ordem) estão em `supabase/migrations/`. Precisam estar aplicadas no projeto Supabase antes de publicar a versão do app que as usa.

## Login e contas (pausado)

Esta seção descreve um sistema de login já construído (banco, tela, testes) mas que **não está ligado na interface atual** — `index.html`/`app.js` hoje funcionam sem exigir login, do jeito que estavam antes. Os arquivos continuam no repositório (`auth.js`, `tarefas.js`, as migrações em `supabase/migrations/20260922*`) prontos para retomar; é só pedir.

Não existe autocadastro — o **admin cria cada conta** direto no painel do Supabase (Authentication → Users → Add user):

1. Escolha um e-mail fictício `<primeiro-nome-em-minúsculo>@mecanizada.com` (ex: `warlison@mecanizada.com`) e uma senha. Marque **"Auto Confirm User"** (assim não precisa enviar nenhum e-mail de verdade — esse domínio não existe).
2. Se já existir uma pessoa cadastrada com esse mesmo e-mail em Configurações → Pessoas (sem login ainda), a conta se liga a ela automaticamente — mantém o histórico e o setor já cadastrados. Para isso, cadastre o e-mail da pessoa em Configurações **antes** de criar a conta.
3. Se não existir, uma pessoa nova é criada automaticamente, com papel `membro` e sem setor definido (você ajusta depois em Configurações).

Na tela de login, a pessoa digita **só o primeiro nome** (ex: "Warlison") + a senha — o app monta o `@mecanizada.com` sozinho. Se dois nomes colidirem (dois "Warlison", por exemplo), escolha um e-mail diferente para o segundo (ex: `warlison2@mecanizada.com`) e avise a pessoa a digitar esse nome na tela.

> **Atenção:** as regras de acesso (RLS) do Supabase **ainda não exigem** login — a chave pública do app continua liberada para ler/escrever tudo, então a tela de login por enquanto é só uma camada de identificação, não uma trava de segurança real. Isso é intencional nesta fase (ver spec em `docs/superpowers/specs/`); avise quando quiser que eu aplique a trava final.

## Como rodar localmente

Abra o arquivo `index.html` em qualquer servidor HTTP estático (ex: Live Server no VS Code).

O app já está configurado para conectar ao Supabase do projeto Grupo GPS.

## Testes

As funções puras (anexos, filtro/ordenação da tabela) têm testes com o runner nativo do Node (18+). Os módulos de tarefas e login (`tarefas.js`, `auth.js`) também têm testes, mesmo não estando ligados na interface atual:

```
node --test
```

## Variáveis de ambiente

Veja `.env.example` para referência.
