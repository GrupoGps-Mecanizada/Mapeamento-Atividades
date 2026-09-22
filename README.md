# MAPEAMENTO DE ATIVIDADES — Grupo GPS Mecanizada

Sistema web para mapeamento de atividades e gestão de problemas operacionais. Permite registrar, acompanhar e resolver problemas por setor, criticidade e responsável, com anexos de imagens e documentos, tarefas diárias pessoais e login por conta.

## Funcionalidades

- 🔐 **Login** por e-mail e senha (Supabase Auth), com papéis **membro** e **admin**; qualquer pessoa com e-mail `@gestaogps.com.br` ou `@gpssa.com.br` pode criar a própria conta pela tela
- 📋 **Lista de problemas** com filtro estilo Excel (por coluna, com contagem) e ordenação por clique no cabeçalho
- 📊 **Dashboard** com KPIs e gráficos de barras por setor/criticidade
- ✅ **Ciclo de vida completo**: Aberto → Em andamento → Aguardando terceiros → Resolvido / Cancelado
- 💬 **Histórico de comentários** por problema (autor é sempre a pessoa logada)
- 📎 **Anexos** de imagens e documentos (JPG, PNG, WebP, PDF, Word, Excel, PowerPoint e TXT; até 10 MB cada, no máximo 10 por problema)
- ✔️ **Tarefas diárias** pessoais, com itens rotineiros (desmarcam sozinhos todo dia) e contínuos
- 📱 **Interface responsiva** para celular (lista em cartões, formulário em tela cheia, botão flutuante)
- 🗑️ **Excluir problemas** com confirmação — só admin (os anexos também são removidos)
- ⚙️ **Configuração** de setores e pessoas — só admin edita; qualquer pessoa logada visualiza
- ☁️ **Persistência em tempo real** via Supabase

## Tecnologias

- HTML5 + CSS3 + JavaScript (Vanilla)
- [Supabase](https://supabase.com) — Postgres, Auth e Storage em nuvem
- Google Fonts (Manrope)

## Estrutura do banco de dados

```
problemas  → id, titulo, descricao, setor, criticidade, status, responsavel_id, aberto_por_id, criado_em, prazo, comentarios (JSONB), anexos (JSONB)
pessoas    → id, nome, setor, email, auth_user_id (liga à conta de login), role (membro | admin)
setores    → id, nome
tarefas    → id, pessoa_id, texto, rotineira, concluida_em, ordem, criado_em
```

Storage: bucket privado `anexos-problemas` (limite de 10 MB por arquivo, tipos restritos no servidor). Os arquivos ficam em `<id do problema>/<uuid>-<nome>` e são abertos por links temporários de 1 hora.

As migrações (em ordem) estão em `supabase/migrations/`. Precisam estar aplicadas no projeto Supabase antes de publicar a versão do app que as usa.

## Login e contas

**Caminho normal — autocadastro:** na tela de login, a pessoa clica em "Criar conta" e usa seu e-mail `@gestaogps.com.br` ou `@gpssa.com.br`. O banco recusa qualquer outro domínio (gatilho em `auth.users`, não dá pra burlar pela tela). Ao criar a conta:

- se já existir uma pessoa cadastrada com esse e-mail (adicionada em Configurações → Pessoas, sem login ainda), a conta nova se liga a ela — mantém o histórico e o setor já cadastrados;
- se não existir, uma pessoa nova é criada automaticamente, com papel `membro` e sem setor definido (o admin ajusta depois em Configurações).

Para manter o histórico de alguém que já tem problemas registrados no sistema, cadastre o e-mail dela em Configurações → Pessoas **antes** de ela criar a conta.

**Caminho alternativo — convite pelo admin:** ainda funciona, para quando você quiser criar a conta por fora (ex: o e-mail da empresa da pessoa está com problema):
1. Rode `scripts/convidar-contas.js` localmente (veja as instruções no topo do arquivo), ou convide manualmente pelo painel do Supabase (Authentication → Users → Add user → Send invite email).
2. Ligue a conta à pessoa: `update pessoas set auth_user_id = (select id from auth.users where email = '...') where nome = '...';` (o autocadastro faz esse passo sozinho; esse comando só é necessário nesse caminho alternativo).

O script nunca usa nenhuma chave secreta minha — ele lê a chave `service_role` de uma variável de ambiente que só existe na máquina de quem roda o script.

> **Atenção:** as regras de acesso (RLS) do Supabase exigem login e uma pessoa vinculada para ler ou escrever qualquer dado. O bucket de anexos segue a mesma regra. Sem isso, o app não funciona — daí a ordem: contas primeiro, trava de acesso depois.

## Como rodar localmente

Abra o arquivo `index.html` em qualquer servidor HTTP estático (ex: Live Server no VS Code).

O app já está configurado para conectar ao Supabase do projeto Grupo GPS.

## Testes

As funções puras (anexos, filtro/ordenação da tabela, tarefas diárias, validação de e-mail da empresa) têm testes com o runner nativo do Node (18+):

```
node --test
```

## Variáveis de ambiente

Veja `.env.example` para referência.
