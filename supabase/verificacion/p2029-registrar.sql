-- P20.29 — registrar las dos migraciones como aplicadas.
--
-- POR QUÉ HACE FALTA
-- Se aplican con `supabase db query --file`, que ejecuta el SQL pero NO anota
-- nada en `supabase_migrations.schema_migrations`. Sin este registro, un
-- futuro `supabase db push` intentaría aplicarlas otra vez. Las dos son
-- idempotentes (se comprobó), así que reaplicarlas no rompería nada — pero
-- dejar el historial mintiendo sí es un problema para quien venga después.
--
-- Es lo mismo que hace `supabase migration repair --status applied`, que aquí
-- no se puede usar porque exige conexión directa a Postgres (y el host de la
-- base solo resuelve IPv6).
insert into supabase_migrations.schema_migrations (version, name)
values
  ('20261021200000', 'p2029_color_producto'),
  ('20261021220000', 'p2029_color_en_product_update')
on conflict (version) do nothing;

select version, name from supabase_migrations.schema_migrations
 where version in ('20261021200000','20261021220000') order by version;
