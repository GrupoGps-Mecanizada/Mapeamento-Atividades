# MAPEAMENTO DE ATIVIDADES — Design

Data: 2026-09-21
Escopo: `index.html`, `app.js`, `README.md` + 1 migração no Supabase.
Fora do escopo: `Central de Problemas.dc.html` e `support.js` (protótipo de design, não usado pelo app).

## Objetivos

1. Renomear o sistema para **MAPEAMENTO DE ATIVIDADES**.
2. Remover o seletor "Você é ...".
3. Interface fluida em celular.
4. Paleta profissional e sóbria.
5. Anexar imagens e documentos aos problemas.

## 1. Nome e "Você é ..."

- "Central de Problemas" vira "MAPEAMENTO DE ATIVIDADES" em: `<title>`, meta description, barra abaixo do cabeçalho, comentário de topo do `app.js`, README.
- A marca "GRUPO GPS Mecanizada" permanece no cabeçalho (nome da empresa, não do sistema).
- Rótulos como "Novo problema", "Lista", "Dashboard" não mudam.
- Remove do `index.html` o bloco "Você é" + `#current-user-select`; do `app.js`, `setCurrentUser` e a parte de `renderSelects` que preenche o seletor.
- Autor dos comentários: o formulário de comentário ganha um `<select>` "Quem está comentando" com as pessoas cadastradas. A última escolha é lembrada em `localStorage` (mesma chave `probsys_user`, para manter a escolha de quem já usa o app).
- `state.currentUserId` passa a representar apenas essa última escolha. Serve de valor inicial de "Aberto por" em novo problema; o campo continua obrigatório e editável.
- Sem autor escolhido, `addComment` recusa com aviso ("Escolha quem está comentando").

## 2. Paleta

Cores centralizadas em variáveis CSS (`:root`) no `<style>` do `index.html`; `app.js` (`CRIT_STYLE`, `STATUS_STYLE` e estilos inline gerados) passa a usar classes/variáveis em vez de valores `oklch` fixos.

| Papel | Valor |
|---|---|
| Marca / cabeçalho / botão primário | `#1F3A5F` (azul-marinho), sólido, sem gradiente |
| Fundo da página | `#F3F5F7` |
| Cartões | `#FFFFFF`, borda `#D9DEE4`, raio 8px |
| Texto / texto secundário | `#1B2430` / `#5B6675` |
| Destrutivo | vermelho fechado `#B42318` |
| Status | Aberto: cinza-ardósia · Em andamento: azul-aço · Aguardando terceiros: âmbar escuro · Resolvido: verde escuro · Cancelado: cinza |
| Criticidade | Alta: vinho · Média: âmbar · Baixa: verde-acinzentado |

Regras: contraste de texto AA (≥ 4.5:1) em todas as etiquetas; sem emoji na interface (o 🗑 do botão excluir vira texto); fonte Manrope mantida (já carregada).

## 3. Mobile

Ponto de corte: `max-width: 768px`. Desktop mantém o layout atual com a paleta nova. Estilos inline migram para classes CSS (pré-requisito para media queries).

- **Cabeçalho:** marca e nome do sistema empilhados; busca em largura total. "+ Novo problema" vira botão flutuante fixo no canto inferior direito (respeitando `env(safe-area-inset-bottom)`), visível em todas as abas.
- **Abas:** barra com rolagem horizontal. **Filtros:** coluna, largura total.
- **Lista:** cada linha vira um cartão (título; etiquetas de criticidade e status; responsável; setor; prazo, em vermelho se vencido). Uma única renderização, o CSS reorganiza `tr`/`td`. Toque abre a edição.
- **Modal:** tela cheia (`100dvh`), campos em uma coluna, botões Salvar/Cancelar fixos no rodapé, rolagem do fundo travada enquanto aberto.
- **Dashboard:** KPIs em 2 colunas; barras em largura total; lista "Mais antigos" quebra linha.
- **Configurações:** linhas de Pessoas quebram em duas linhas.
- **Toque:** alvos ≥ 44px; `font-size: 16px` em inputs/selects (evita zoom automático no iOS). Toast posicionado acima do botão flutuante.

## 4. Anexos

### Banco (projeto Supabase `mfsyrsegkvjmefcdaegh`, "PRODUTIVIDADE")

Migração aditiva, compatível com a versão atual do app (que ignora a coluna nova):

```sql
alter table public.problemas
  add column anexos jsonb not null default '[]'::jsonb;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'anexos-problemas', 'anexos-problemas', false, 10485760,
  array[
    'image/jpeg','image/png','image/webp','application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain'
  ]
);

create policy "anexos-problemas select" on storage.objects
  for select to anon, authenticated using (bucket_id = 'anexos-problemas');
create policy "anexos-problemas insert" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'anexos-problemas');
create policy "anexos-problemas delete" on storage.objects
  for delete to anon, authenticated using (bucket_id = 'anexos-problemas');
```

Sem política de UPDATE (arquivos não são sobrescritos). Nenhuma outra tabela ou bucket é alterado.

**Exposição:** o app não tem login e a chave pública está no repositório; qualquer pessoa com ela consegue listar, baixar e apagar arquivos deste bucket. Mesmo nível de exposição das tabelas atuais (RLS `true` para `anon`). Limite de 10 MB e lista de tipos são impostos pelo servidor. Se houver login no futuro, restringir as políticas.

### Modelo de dados

`problemas.anexos`: lista de `{ path, nome, tipo, tamanho, enviado_em }`.
Caminho no storage: `<problema_id>/<uuid>-<nome sanitizado>` (sem acentos/caracteres especiais; nome original guardado em `nome`).

### Fluxo no app

- Seção "Anexos" no modal (novo e edição): botão "Adicionar arquivo" (`<input type="file" multiple accept=...>`; no celular oferece câmera, galeria e arquivos). Lista com ícone (miniatura para imagem), nome, tamanho, abrir e remover. "Abrir" usa URL assinada de 1 hora.
- **Nada é enviado antes de Salvar.** Arquivos escolhidos ficam pendentes no `draft`; remoções ficam marcadas.
  1. Ao salvar: valida; envia os pendentes (em paralelo, com progresso no overlay de carregamento).
  2. Se qualquer envio falhar: remove do storage os já enviados naquele lote, não grava o problema, avisa o erro.
  3. Sucesso: `upsert` do problema com `anexos` atualizado; em seguida remove do storage (melhor esforço) os marcados para remoção.
- Imagens são reduzidas no aparelho antes do envio (lado maior 1600px, JPEG qualidade 0.8 via canvas). Isso reduz dados e converte HEIC.
- Validação na tela: 10 MB por arquivo, tipos aprovados, máximo 10 anexos por problema; arquivo recusado gera aviso com o motivo.
- Excluir problema também remove seus arquivos do storage (melhor esforço).
- Nomes de arquivo escapados com `esc()` ao renderizar. Lista/cartão mostra indicador com a contagem de anexos.

## 5. Verificação

- Conferir layout em 360, 390, 768 e 1280 px em todas as abas e no modal (com aviso claro se não for possível rodar um navegador).
- Fluxo de anexos ponta a ponta contra o banco real: criar problema de teste, enviar arquivo, abrir, remover, excluir o problema, confirmar que o storage ficou limpo.
- Recusa de tipo não permitido e de arquivo > 10 MB.
- Conferir que problemas existentes (sem `anexos`) abrem e salvam normalmente.

## 6. Entrega

- Branch `mapeamento-de-atividades`, commits pequenos. A migração é aplicada antes de publicar o código.
- Nenhum `push` sem confirmação do usuário. A pasta `.thumbnail` não é versionada.
- Aberto: onde o app é publicado para uso diário (o README só descreve execução local).
