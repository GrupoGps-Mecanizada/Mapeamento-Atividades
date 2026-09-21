# MAPEAMENTO DE ATIVIDADES — Grupo GPS Mecanizada

Sistema web para mapeamento de atividades e gestão de problemas operacionais. Permite registrar, acompanhar e resolver problemas por setor, criticidade e responsável, com anexos de imagens e documentos.

## Funcionalidades

- 📋 **Lista de problemas** com filtros por setor, criticidade e responsável
- 📊 **Dashboard** com KPIs e gráficos de barras por setor/criticidade
- ✅ **Ciclo de vida completo**: Aberto → Em andamento → Aguardando terceiros → Resolvido / Cancelado
- 💬 **Histórico de comentários** por problema (com escolha de quem está comentando)
- 📎 **Anexos** de imagens e documentos (JPG, PNG, WebP, PDF, Word, Excel, PowerPoint e TXT; até 10 MB cada, no máximo 10 por problema)
- 📱 **Interface responsiva** para celular (lista em cartões, formulário em tela cheia, botão flutuante)
- 🗑️ **Excluir problemas** com confirmação (os anexos também são removidos)
- ⚙️ **Configuração** de setores e pessoas
- ☁️ **Persistência em tempo real** via Supabase

## Tecnologias

- HTML5 + CSS3 + JavaScript (Vanilla)
- [Supabase](https://supabase.com) — banco de dados PostgreSQL e Storage em nuvem
- Google Fonts (Manrope)

## Estrutura do banco de dados

```
problemas  → id, titulo, descricao, setor, criticidade, status, responsavel_id, aberto_por_id, criado_em, prazo, comentarios (JSONB), anexos (JSONB)
pessoas    → id, nome, setor
setores    → id, nome
```

Storage: bucket privado `anexos-problemas` (limite de 10 MB por arquivo, tipos restritos no servidor). Os arquivos ficam em `<id do problema>/<uuid>-<nome>` e são abertos por links temporários de 1 hora.

A migração que cria a coluna `anexos` e o bucket está em `supabase/migrations/20260921120000_anexos_problemas.sql`. Ela precisa estar aplicada no projeto Supabase **antes** de publicar esta versão do app.

> **Atenção:** o app não tem login e a chave pública está no código, então o envio, a leitura e a exclusão de anexos seguem o mesmo nível de acesso das tabelas (aberto a quem tem a chave). Não use o bucket para arquivos que exijam sigilo.

## Como rodar localmente

Abra o arquivo `index.html` em qualquer servidor HTTP estático (ex: Live Server no VS Code).

O app já está configurado para conectar ao Supabase do projeto Grupo GPS.

## Testes

As funções puras dos anexos (validação, nomes de arquivo, redimensionamento) têm testes com o runner nativo do Node (18+):

```
node --test
```

## Variáveis de ambiente

Veja `.env.example` para referência.
