-- Bucket `produtos` (leitura pública, criado via Storage API) só pode ser escrito
-- por admin — a foto do produto é pública, mas só o admin sobe/troca/apaga.
create policy produtos_storage_admin_insert on storage.objects for insert
  with check (bucket_id = 'produtos' and is_admin());
create policy produtos_storage_admin_update on storage.objects for update
  using (bucket_id = 'produtos' and is_admin())
  with check (bucket_id = 'produtos' and is_admin());
create policy produtos_storage_admin_delete on storage.objects for delete
  using (bucket_id = 'produtos' and is_admin());
