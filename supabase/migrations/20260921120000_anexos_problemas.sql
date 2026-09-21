-- MAPEAMENTO DE ATIVIDADES — anexos dos problemas
-- Aditiva: a versão anterior do app continua funcionando (ignora a coluna nova).

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
