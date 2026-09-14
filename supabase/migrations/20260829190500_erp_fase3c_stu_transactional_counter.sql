-- P20.17B
-- Consecutivo STU transaccional y sin huecos provocados por rollback.
--
-- Objetivos:
-- 1. Un STU representa una unidad física realmente recibida.
-- 2. Un rollback no consume consecutivos.
-- 3. Recepciones concurrentes no generan STU duplicados.
-- 4. El contador no depende de MAX(unit_code) durante cada recepción.
-- 5. La secuencia product_unit_code_seq queda como legado, sin uso.
--
-- IMPORTANTE:
-- Esta migración preserva las RPC públicas existentes y cambia únicamente
-- el mecanismo interno de asignación del consecutivo.

create table if not exists public.product_unit_number_counter (
  id smallint primary key
    check (id = 1),

  last_value bigint not null
    check (last_value >= 0),

  updated_at timestamptz not null default now()
);

alter table public.product_unit_number_counter
  enable row level security;

-- El contador es infraestructura interna.
-- Ningún cliente anon/authenticated debe leerlo o modificarlo directamente.
revoke all
on table public.product_unit_number_counter
from public, anon, authenticated;


-- Inicialización/migración:
-- tomar únicamente el mayor STU que realmente exista como unidad física.
-- No usar product_unit_code_seq porque una sequence puede contener valores
-- consumidos por transacciones que posteriormente hicieron rollback.
insert into public.product_unit_number_counter (
  id,
  last_value,
  updated_at
)
select
  1,
  coalesce(
    max(substring(unit_code from 5)::bigint),
    0
  ),
  now()
from public.product_units
where unit_code ~ '^STU-[0-9]+$'
on conflict (id) do update
set
  last_value = greatest(
    public.product_unit_number_counter.last_value,
    excluded.last_value
  ),
  updated_at = now();


-- Generador interno transaccional.
--
-- UPDATE sobre la fila singleton:
-- - toma row lock automáticamente;
-- - serializa recepciones concurrentes;
-- - participa en la misma transacción;
-- - un ROLLBACK también revierte el incremento.
create or replace function public.erp_internal_next_product_unit_number()
returns bigint
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_next bigint;
begin
  update public.product_unit_number_counter
  set
    last_value = last_value + 1,
    updated_at = now()
  where id = 1
  returning last_value
  into v_next;

  if v_next is null then
    raise exception 'product_unit_number_counter_missing';
  end if;

  return v_next;
end;
$function$;

revoke all
on function public.erp_internal_next_product_unit_number()
from public, anon, authenticated;

grant execute
on function public.erp_internal_next_product_unit_number()
to postgres;


-- Cambiar las DOS rutas existentes que generan STU:
--
-- 1. Recepción individual / erp_receive_units_batch.
-- 2. Recepción de compra / erp_receive_purchase_batch.
--
-- Se modifica únicamente la expresión nextval(...). El resto de cada
-- función queda exactamente como fue definido por sus migraciones originales.
do $migration$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid)
  into strict v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'erp_internal_receive_product_unit';

  if position(
    'nextval(''public.product_unit_code_seq'')'
    in v_def
  ) = 0 then
    raise exception
      'P20_17B_expected_sequence_reference_missing_product_unit';
  end if;

  v_def := replace(
    v_def,
    'nextval(''public.product_unit_code_seq'')',
    'public.erp_internal_next_product_unit_number()'
  );

  execute v_def;


  select pg_get_functiondef(p.oid)
  into strict v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'erp_internal_receive_purchase_batch';

  if position(
    'nextval(''public.product_unit_code_seq'')'
    in v_def
  ) = 0 then
    raise exception
      'P20_17B_expected_sequence_reference_missing_purchase_batch';
  end if;

  v_def := replace(
    v_def,
    'nextval(''public.product_unit_code_seq'')',
    'public.erp_internal_next_product_unit_number()'
  );

  execute v_def;
end;
$migration$;


-- La consulta "¿qué consecutivo vamos?" debe leer el contador autoritativo,
-- no una sequence legacy que puede contener números consumidos por rollback.
create or replace function public.erp_inventory_sequence_status()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_last bigint;
begin
  perform public.erp_assert_permission('inventory.read');

  select last_value
  into v_last
  from public.product_unit_number_counter
  where id = 1;

  if not found then
    raise exception 'product_unit_number_counter_missing';
  end if;

  if v_last = 0 then
    return jsonb_build_object(
      'lastUsed', null,
      'lastUsedCode', null,
      'nextExpected', 1,
      'nextExpectedCode', 'STU-000001'
    );
  end if;

  return jsonb_build_object(
    'lastUsed', v_last,
    'lastUsedCode',
      'STU-' || lpad(v_last::text, 6, '0'),
    'nextExpected', v_last + 1,
    'nextExpectedCode',
      'STU-' || lpad((v_last + 1)::text, 6, '0')
  );
end;
$function$;


-- Guardas de migración.
-- Si cualquiera de estas condiciones falla, queremos detectar el problema
-- inmediatamente en lugar de dejar dos generadores de STU coexistiendo.
do $verification$
declare
  v_counter bigint;
  v_real_max bigint;
  v_generators integer;
begin
  select last_value
  into v_counter
  from public.product_unit_number_counter
  where id = 1;

  if v_counter is null then
    raise exception 'P20_17B_counter_not_initialized';
  end if;

  select coalesce(
    max(substring(unit_code from 5)::bigint),
    0
  )
  into v_real_max
  from public.product_units
  where unit_code ~ '^STU-[0-9]+$';

  if v_counter < v_real_max then
    raise exception
      'P20_17B_counter_behind_existing_units counter=% max_real=%',
      v_counter,
      v_real_max;
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and pg_get_functiondef(p.oid)
          ilike '%product_unit_code_seq%'
  ) then
    raise exception
      'P20_17B_legacy_sequence_reference_still_present';
  end if;

  select count(*)
  into v_generators
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'erp_internal_receive_product_unit',
      'erp_internal_receive_purchase_batch'
    )
    and pg_get_functiondef(p.oid)
        ilike '%erp_internal_next_product_unit_number%';

  if v_generators <> 2 then
    raise exception
      'P20_17B_expected_two_transactional_generators_found:%',
      v_generators;
  end if;
end;
$verification$;


comment on table public.product_unit_number_counter is
  'Contador transaccional autoritativo para consecutivos internos STU. P20.17B.';

comment on function public.erp_internal_next_product_unit_number() is
  'Asigna el siguiente consecutivo STU mediante contador singleton transaccional.';

comment on sequence public.product_unit_code_seq is
  'LEGACY: conservada por compatibilidad histórica. No usar para nuevas asignaciones STU desde P20.17B.';
