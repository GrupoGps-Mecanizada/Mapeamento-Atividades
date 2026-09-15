# Gestão de Problemas — Grupo GPS Mecanizada

Sistema web para gestão de problemas operacionais. Permite registrar, acompanhar e resolver problemas por setor, criticidade e responsável.

## Funcionalidades

- 📋 **Lista de problemas** com filtros por setor, criticidade e responsável
- 📊 **Dashboard** com KPIs e gráficos de barras por setor/criticidade
- ✅ **Ciclo de vida completo**: Aberto → Em andamento → Aguardando terceiros → Resolvido / Cancelado
- 💬 **Histórico de comentários** por problema
- 🗑️ **Excluir problemas** com confirmação
- ⚙️ **Configuração** de setores e pessoas
- ☁️ **Persistência em tempo real** via Supabase

## Tecnologias

- HTML5 + CSS3 + JavaScript (Vanilla)
- [Supabase](https://supabase.com) — banco de dados PostgreSQL em nuvem
- Google Fonts (Manrope)

## Estrutura do banco de dados

```
problemas  → id, titulo, descricao, setor, criticidade, status, responsavel_id, aberto_por_id, criado_em, prazo, comentarios (JSONB)
pessoas    → id, nome, setor
setores    → id, nome
```

## Como rodar localmente

Abra o arquivo `index.html` em qualquer servidor HTTP estático (ex: Live Server no VS Code).

O app já está configurado para conectar ao Supabase do projeto Grupo GPS.

## Variáveis de ambiente

Veja `.env.example` para referência.
