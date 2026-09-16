-- P20.20A.1 · Fixtures PRE-dry-run para el backfill de
-- 20260917000000_erp_fase3h_customer_autoregistration_backfill.sql
--
-- ── USO ────────────────────────────────────────────────────────────────
--   BEGIN;
--   \i scripts/p20_20a1_predryrun_fixtures.sql
--   \i supabase/migrations/20260917000000_erp_fase3h_customer_autoregistration_backfill.sql
--   \i scripts/p20_20a1_hardening_tests.sql
--   ROLLBACK;
--
-- Este archivo se ejecuta ANTES de cargar la migración: los casos que
-- prueban el BACKFILL (no la creación de ventas nuevas) tienen que existir
-- de antemano para que el backfill los encuentre y los procese de verdad.
--
-- Exclusivamente ficticio: documentos "P20A1-BF..." (nunca coinciden con un
-- documento real), correos bajo `example.invalid` (dominio reservado por
-- RFC 2606, nunca resuelve). Ningún UUID real, ningún dato de STAGING.
--
-- Sin BEGIN/COMMIT/ROLLBACK/SET ROLE propios — los administra quien
-- ejecute este archivo (ver el USO de arriba). Sin cleanup manual: todo
-- vive y muere dentro de la misma transacción externa (ROLLBACK).
--
-- Antes de insertar cada fixture, se aborta con RAISE EXCEPTION si ese
-- document_number de prueba YA existe en `customers` o `sales` — nunca se
-- asume que la base está "limpia".

-- ═══════════════════════════════════════════════════════════════════════
-- BF1 — conflicto de email: mismo documento/nombre/teléfono, DOS emails
-- reales y distintos. El backfill debe EXCLUIR este documento por completo.
-- ═══════════════════════════════════════════════════════════════════════
do $guard_bf1$
begin
  if exists (select 1 from public.customers where document_number = 'P20A1-BF1-DOC')
     or exists (select 1 from public.sales where customer_document = 'P20A1-BF1-DOC') then
    raise exception 'P20A1_FIXTURE_COLLISION: P20A1-BF1-DOC ya existe en customers/sales — aborta, no se insertan fixtures duplicados';
  end if;
end;
$guard_bf1$;

insert into public.sales (
  customer_name, customer_document, customer_phone, customer_email,
  subtotal_cop, discount_cop, total_cop, payment_method, payment_status, warranty_months,
  idempotency_key, created_at
) values
  (
    'P20A1 BF1 Nombre', 'P20A1-BF1-DOC', '3010000001', 'p20a1-a@example.invalid',
    100000, 0, 100000, 'efectivo', 'pagado', 0,
    gen_random_uuid(), '2026-01-01 10:00:00+00'::timestamptz
  ),
  (
    'P20A1 BF1 Nombre', 'P20A1-BF1-DOC', '3010000001', 'p20a1-b@example.invalid',
    150000, 0, 150000, 'efectivo', 'pagado', 0,
    gen_random_uuid(), '2026-01-02 10:00:00+00'::timestamptz
  );

-- ═══════════════════════════════════════════════════════════════════════
-- BF2 — un email real + un NULL: mismo documento/nombre/teléfono, mismo
-- resultado esperable. El backfill debe enlazar AMBAS ventas al MISMO
-- customer nuevo. La venta MÁS ANTIGUA (created_at menor) es la que trae
-- el email real, para que el resultado determinista sea comprobable en el
-- archivo de tests.
-- ═══════════════════════════════════════════════════════════════════════
do $guard_bf2$
begin
  if exists (select 1 from public.customers where document_number = 'P20A1-BF2-DOC')
     or exists (select 1 from public.sales where customer_document = 'P20A1-BF2-DOC') then
    raise exception 'P20A1_FIXTURE_COLLISION: P20A1-BF2-DOC ya existe en customers/sales — aborta, no se insertan fixtures duplicados';
  end if;
end;
$guard_bf2$;

insert into public.sales (
  customer_name, customer_document, customer_phone, customer_email,
  subtotal_cop, discount_cop, total_cop, payment_method, payment_status, warranty_months,
  idempotency_key, created_at
) values
  (
    -- LA MÁS ANTIGUA — con email real.
    'P20A1 BF2 Nombre', 'P20A1-BF2-DOC', '3020000002', 'p20a1-bf2-viejo@example.invalid',
    200000, 0, 200000, 'efectivo', 'pagado', 0,
    gen_random_uuid(), '2026-01-01 09:00:00+00'::timestamptz
  ),
  (
    -- LA MÁS NUEVA — email NULL (no es conflicto: NULL nunca cuenta como
    -- "otro email distinto").
    'P20A1 BF2 Nombre', 'P20A1-BF2-DOC', '3020000002', null,
    250000, 0, 250000, 'efectivo', 'pagado', 0,
    gen_random_uuid(), '2026-01-02 09:00:00+00'::timestamptz
  );

-- ═══════════════════════════════════════════════════════════════════════
-- BF3 — caso de posventa LEGACY: una venta con customer_id NULL (snapshot
-- completo, el backfill de VENTAS la debe enlazar) y un after_sales_case
-- que YA existía con customer_id NULL y sale_id apuntando a esa venta —
-- igual que quedaron los casos reales de STAGING antes de este backfill.
-- `after_sales_cases.customer_id` es INMUTABLE
-- (`erp_guard_after_sales_case_identity`) — el backfill NUNCA lo toca; el
-- caso debe seguir con customer_id NULL después de todo, y aun así
-- `customers.history` debe encontrarlo vía `sale_id` (ver
-- 20260917000000, parche 3b).
-- ═══════════════════════════════════════════════════════════════════════
do $guard_bf3$
begin
  if exists (select 1 from public.customers where document_number = 'P20A1-BF3-DOC')
     or exists (select 1 from public.sales where customer_document = 'P20A1-BF3-DOC')
     or exists (select 1 from public.after_sales_cases where case_number = 'P20A1-CASE-BF3-LEGACY') then
    raise exception 'P20A1_FIXTURE_COLLISION: P20A1-BF3-DOC / P20A1-CASE-BF3-LEGACY ya existen — aborta, no se insertan fixtures duplicados';
  end if;
end;
$guard_bf3$;

do $create_bf3$
declare
  v_sale_id uuid;
  v_product_id uuid;
  v_unit_id uuid;
  v_sale_item_id uuid;
  v_sale_number text;
begin
  insert into public.sales (
    customer_name, customer_document, customer_phone, customer_email,
    subtotal_cop, discount_cop, total_cop, payment_method, payment_status, warranty_months,
    idempotency_key, created_at
  ) values (
    'P20A1 BF3 Nombre', 'P20A1-BF3-DOC', '3030000003', 'p20a1-bf3@example.invalid',
    300000, 0, 300000, 'efectivo', 'pagado', 6,
    gen_random_uuid(), '2026-01-01 08:00:00+00'::timestamptz
  ) returning id, sale_number into v_sale_id, v_sale_number;

  insert into public.products (title) values ('P20A1 Producto Legacy BF3') returning id into v_product_id;

  insert into public.product_units (product_id, unit_code, status, sold_at)
  values (
    v_product_id,
    'STU-P20A1BF3',
    'sold',
    '2026-01-01 08:00:00+00'::timestamptz
  ) returning id into v_unit_id;

  insert into public.sale_items (
    sale_id, item_type, product_id, product_unit_id, product_name, unit_price_cop, quantity, subtotal_cop
  ) values (
    v_sale_id, 'catalog', v_product_id, v_unit_id, 'P20A1 Producto Legacy BF3', 300000, 1, 300000
  ) returning id into v_sale_item_id;

  -- customer_id = NULL a propósito: es EXACTAMENTE el estado legacy real
  -- (caso abierto cuando la venta todavía no tenía customer_id) — nunca se
  -- toca después.
  insert into public.after_sales_cases (
    case_number, case_type, status, sale_id, sale_item_id, product_unit_id, customer_id,
    sale_number_snapshot, customer_name_snapshot, customer_document_snapshot, customer_phone_snapshot,
    product_name_snapshot, unit_code_snapshot, reported_issue, coverage_status
  ) values (
    'P20A1-CASE-BF3-LEGACY', 'warranty', 'open', v_sale_id, v_sale_item_id, v_unit_id, null,
    v_sale_number, 'P20A1 BF3 Nombre', 'P20A1-BF3-DOC', '3030000003',
    'P20A1 Producto Legacy BF3', 'STU-P20A1BF3', 'Falla de prueba P20A1 BF3 (fixture legacy)', 'in_warranty'
  );
end;
$create_bf3$;
