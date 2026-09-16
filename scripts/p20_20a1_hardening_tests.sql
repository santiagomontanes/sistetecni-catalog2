-- P20.20A.1 · Tests de regresión post-migración para
-- 20260917000000_erp_fase3h_customer_autoregistration_backfill.sql
--
-- ── USO ────────────────────────────────────────────────────────────────
--   BEGIN;
--   \i scripts/p20_20a1_predryrun_fixtures.sql
--   \i supabase/migrations/20260917000000_erp_fase3h_customer_autoregistration_backfill.sql
--   \i scripts/p20_20a1_hardening_tests.sql
--   ROLLBACK;
--
-- Se ejecuta DESPUÉS de la migración, dentro de la MISMA transacción
-- externa (BEGIN/ROLLBACK los pone quien ejecute, no este archivo). Sin
-- BEGIN/COMMIT/ROLLBACK/SET ROLE propios — los `begin`/`exception` de los
-- bloques DO son PL/pgSQL normal, no control transaccional. Sin cleanup
-- manual: todo desaparece con el ROLLBACK externo.
--
-- Exclusivamente ficticio: documentos "P20A1-T..." nuevos en este archivo,
-- más los fixtures "P20A1-BF..." ya cargados por
-- p20_20a1_predryrun_fixtures.sql. Cualquier fallo aborta con
-- RAISE EXCEPTION (nunca sigue silencioso a la siguiente prueba).

-- ═══════════════════════════════════════════════════════════════════════
-- TEST 1 — autoridad del customer MAESTRO sobre el snapshot de la venta
-- ═══════════════════════════════════════════════════════════════════════
-- Contexto de auth (repetido en TEST1/2/3/9, sin objetos persistentes):
-- `erp_internal_create_sale_with_units` exige `auth.uid()` = un
-- `profiles.id` con `is_admin=true` (`erp_admin_required` si no). Se
-- resuelve un admin REAL ya existente de forma dinámica — nunca un UUID
-- hardcodeado — y se fija con el MISMO mecanismo que usa `auth.uid()`
-- (auditado en vivo: `auth.uid()` lee `current_setting('request.jwt.claim.
-- sub', true)` primero). `set_config(..., true)` es transaction-local: NO
-- persiste tras el ROLLBACK externo, no se toca `profiles`, no se llama
-- `erp_legacy_elevate()`.
do $test1_master_gana$
declare
  v_admin_profile_id uuid;
  v_master_customer_id uuid;
  v_sale_id uuid;
  v_sale_customer_id uuid;
  v_sale_name text;
  v_sale_phone text;
  v_sale_email text;
  v_master_name_after text;
  v_master_phone_after text;
  v_master_email_after text;
begin
  select id into v_admin_profile_id from public.profiles where is_admin = true order by id limit 1;
  if v_admin_profile_id is null then
    raise exception 'test_admin_profile_required';
  end if;
  perform set_config('request.jwt.claim.sub', v_admin_profile_id::text, true);
  if auth.uid() is distinct from v_admin_profile_id then
    raise exception 'TEST_AUTH_CONTEXT_FAILED';
  end if;

  if exists (select 1 from public.customers where document_number = 'P20A1-T1-DOC') then
    raise exception 'P20A1_FIXTURE_COLLISION: P20A1-T1-DOC ya existe en customers';
  end if;

  insert into public.customers (full_name, document_number, phone, email)
  values ('P20A1 Cliente Maestro Uno', 'P20A1-T1-DOC', '3010000010', 'p20a1-master1@example.invalid')
  returning id into v_master_customer_id;

  -- Venta con customer_id NULL, mismo documento, pero nombre/teléfono/email
  -- del INPUT deliberadamente DISTINTOS al maestro.
  v_sale_id := public.erp_internal_create_sale_with_units(
    null, 'P20A1 Nombre Distinto', 'P20A1-T1-DOC', '3999999991', 'p20a1-distinto1@example.invalid',
    '[{"itemType":"manual","description":"item de prueba T1","unitPriceCop":1000,"quantity":1}]'::jsonb,
    0, 'efectivo', 'pagado', 0, null, gen_random_uuid()
  );

  select customer_id, customer_name, customer_phone, customer_email
    into v_sale_customer_id, v_sale_name, v_sale_phone, v_sale_email
  from public.sales where id = v_sale_id;

  select full_name, phone, email into v_master_name_after, v_master_phone_after, v_master_email_after
  from public.customers where id = v_master_customer_id;

  if v_sale_customer_id is distinct from v_master_customer_id then
    raise exception 'TEST1_FAILED: sale.customer_id (%) != customer maestro (%)', v_sale_customer_id, v_master_customer_id;
  end if;

  if v_master_name_after <> 'P20A1 Cliente Maestro Uno'
     or v_master_phone_after <> '3010000010'
     or v_master_email_after <> 'p20a1-master1@example.invalid' then
    raise exception 'TEST1_FAILED: el customer maestro cambió (name=%, phone=%, email=%)', v_master_name_after, v_master_phone_after, v_master_email_after;
  end if;

  if v_sale_name <> 'P20A1 Cliente Maestro Uno' then
    raise exception 'TEST1_FAILED: sales.customer_name no usó al maestro (llegó %)', v_sale_name;
  end if;
  if v_sale_phone <> '3010000010' then
    raise exception 'TEST1_FAILED: sales.customer_phone no usó al maestro (llegó %)', v_sale_phone;
  end if;
  if v_sale_email <> 'p20a1-master1@example.invalid' then
    raise exception 'TEST1_FAILED: sales.customer_email no usó al maestro (llegó %)', v_sale_email;
  end if;

  raise notice 'TEST1 OK: v_sale_customer_id=v_master_customer_id=%, customer maestro intacto, snapshot de sale = maestro', v_master_customer_id;
end;
$test1_master_gana$;

-- ═══════════════════════════════════════════════════════════════════════
-- TEST 2 — customer maestro INCOMPLETO (teléfono vacío): falla explícito,
-- nunca se completa informalmente, ni se crea un customer duplicado.
-- ═══════════════════════════════════════════════════════════════════════
do $test2_maestro_incompleto$
declare
  v_admin_profile_id uuid;
  v_idempotency_key uuid := gen_random_uuid();
  v_fallo boolean := false;
  v_sale_id uuid;
  v_customers_count int;
  v_phone_after text;
begin
  select id into v_admin_profile_id from public.profiles where is_admin = true order by id limit 1;
  if v_admin_profile_id is null then
    raise exception 'test_admin_profile_required';
  end if;
  perform set_config('request.jwt.claim.sub', v_admin_profile_id::text, true);
  if auth.uid() is distinct from v_admin_profile_id then
    raise exception 'TEST_AUTH_CONTEXT_FAILED';
  end if;

  if exists (select 1 from public.customers where document_number = 'P20A1-T2-DOC') then
    raise exception 'P20A1_FIXTURE_COLLISION: P20A1-T2-DOC ya existe en customers';
  end if;

  insert into public.customers (full_name, document_number, phone)
  values ('P20A1 Cliente Incompleto', 'P20A1-T2-DOC', null);

  begin
    v_sale_id := public.erp_internal_create_sale_with_units(
      null, 'P20A1 Nombre Cualquiera', 'P20A1-T2-DOC', '3111111111', null,
      '[{"itemType":"manual","description":"item de prueba T2","unitPriceCop":1000,"quantity":1}]'::jsonb,
      0, 'efectivo', 'pagado', 0, null, v_idempotency_key
    );
  exception when others then
    v_fallo := true;
    if sqlerrm not like '%customer_phone_required%' then
      raise exception 'TEST2_FAILED: falló, pero NO con customer_phone_required (sqlerrm=%)', sqlerrm;
    end if;
  end;

  if not v_fallo then
    raise exception 'TEST2_FAILED: la venta se creó (sale_id=%) en vez de fallar por teléfono maestro vacío', v_sale_id;
  end if;

  if exists (select 1 from public.sales where idempotency_key = v_idempotency_key) then
    raise exception 'TEST2_FAILED: existe una sale con el idempotency_key usado, pese a que la creación falló';
  end if;

  select phone into v_phone_after from public.customers where document_number = 'P20A1-T2-DOC';
  if v_phone_after is not null then
    raise exception 'TEST2_FAILED: el customer maestro fue completado informalmente (phone=%)', v_phone_after;
  end if;

  select count(*) into v_customers_count from public.customers where document_number = 'P20A1-T2-DOC';
  if v_customers_count <> 1 then
    raise exception 'TEST2_FAILED: se esperaba exactamente 1 customer para P20A1-T2-DOC, hay %', v_customers_count;
  end if;

  raise notice 'TEST2 OK: falló con customer_phone_required, sin sale con ese idempotency_key, customer sigue con phone NULL, sin duplicados';
end;
$test2_maestro_incompleto$;

-- ═══════════════════════════════════════════════════════════════════════
-- TEST 3 — customer NUEVO: se crea, se enlaza, datos coherentes de punta a
-- punta.
-- ═══════════════════════════════════════════════════════════════════════
do $test3_customer_nuevo$
declare
  v_admin_profile_id uuid;
  v_sale_id uuid;
  v_sale_customer_id uuid;
  v_sale_name text;
  v_sale_phone text;
  v_sale_email text;
  v_customers_count int;
  v_customer_name text;
  v_customer_phone text;
  v_customer_email text;
begin
  select id into v_admin_profile_id from public.profiles where is_admin = true order by id limit 1;
  if v_admin_profile_id is null then
    raise exception 'test_admin_profile_required';
  end if;
  perform set_config('request.jwt.claim.sub', v_admin_profile_id::text, true);
  if auth.uid() is distinct from v_admin_profile_id then
    raise exception 'TEST_AUTH_CONTEXT_FAILED';
  end if;

  if exists (select 1 from public.customers where document_number = 'P20A1-T3-DOC') then
    raise exception 'P20A1_FIXTURE_COLLISION: P20A1-T3-DOC ya existe en customers';
  end if;

  v_sale_id := public.erp_internal_create_sale_with_units(
    null, 'P20A1 Cliente Totalmente Nuevo', 'P20A1-T3-DOC', '3222222222', 'p20a1-nuevo3@example.invalid',
    '[{"itemType":"manual","description":"item de prueba T3","unitPriceCop":2000,"quantity":1}]'::jsonb,
    0, 'efectivo', 'pagado', 0, null, gen_random_uuid()
  );

  select customer_id, customer_name, customer_phone, customer_email
    into v_sale_customer_id, v_sale_name, v_sale_phone, v_sale_email
  from public.sales where id = v_sale_id;

  if v_sale_customer_id is null then
    raise exception 'TEST3_FAILED: la venta quedó con customer_id NULL';
  end if;

  select count(*) into v_customers_count from public.customers where document_number = 'P20A1-T3-DOC';
  if v_customers_count <> 1 then
    raise exception 'TEST3_FAILED: se esperaba exactamente 1 customer nuevo para P20A1-T3-DOC, hay %', v_customers_count;
  end if;

  select full_name, phone, email into v_customer_name, v_customer_phone, v_customer_email
  from public.customers where id = v_sale_customer_id;

  if v_customer_name is distinct from 'P20A1 Cliente Totalmente Nuevo'
     or v_customer_phone is distinct from '3222222222'
     or v_customer_email is distinct from 'p20a1-nuevo3@example.invalid' then
    raise exception 'TEST3_FAILED: el customer creado no coincide con los datos de la venta (name=%, phone=%, email=%)', v_customer_name, v_customer_phone, v_customer_email;
  end if;

  if v_sale_name is distinct from v_customer_name
     or v_sale_phone is distinct from v_customer_phone
     or v_sale_email is distinct from v_customer_email then
    raise exception 'TEST3_FAILED: el snapshot de sales no coincide con el customer (sale name=%/phone=%/email=%)', v_sale_name, v_sale_phone, v_sale_email;
  end if;

  raise notice 'TEST3 OK: customer nuevo id=% creado y enlazado, snapshot de sales coherente con customer', v_sale_customer_id;
end;
$test3_customer_nuevo$;

-- ═══════════════════════════════════════════════════════════════════════
-- TEST 4 — BACKFILL REAL: conflicto de email (fixture BF1, ya cargada
-- ANTES de la migración). NO se vuelve a insertar nada aquí — se verifica
-- el resultado que dejó el backfill sobre datos preexistentes.
-- ═══════════════════════════════════════════════════════════════════════
do $test4_backfill_conflicto_email$
declare
  v_sales_sin_customer int;
  v_sales_total int;
  v_customers_count int;
begin
  select count(*) into v_sales_total from public.sales where customer_document = 'P20A1-BF1-DOC';
  if v_sales_total <> 2 then
    raise exception 'TEST4_FAILED: se esperaban 2 ventas de la fixture BF1, hay % (¿corrió p20_20a1_predryrun_fixtures.sql?)', v_sales_total;
  end if;

  select count(*) into v_sales_sin_customer
  from public.sales where customer_document = 'P20A1-BF1-DOC' and customer_id is null;
  if v_sales_sin_customer <> 2 then
    raise exception 'TEST4_FAILED: se esperaba que las 2 ventas BF1 siguieran con customer_id NULL, pero % lo tienen NULL', v_sales_sin_customer;
  end if;

  select count(*) into v_customers_count from public.customers where document_number = 'P20A1-BF1-DOC';
  if v_customers_count <> 0 then
    raise exception 'TEST4_FAILED: NO debía crearse ningún customer para P20A1-BF1-DOC (conflicto de email), pero hay %', v_customers_count;
  end if;

  -- Snapshots intactos: los dos emails originales siguen presentes tal cual.
  if not exists (select 1 from public.sales where customer_document = 'P20A1-BF1-DOC' and customer_email = 'p20a1-a@example.invalid')
     or not exists (select 1 from public.sales where customer_document = 'P20A1-BF1-DOC' and customer_email = 'p20a1-b@example.invalid') then
    raise exception 'TEST4_FAILED: los snapshots de email de BF1 fueron alterados';
  end if;

  raise notice 'TEST4 OK: BF1 (conflicto de email) quedó excluida del backfill real — 2 ventas, customer_id NULL, 0 customers, snapshots intactos';
end;
$test4_backfill_conflicto_email$;

-- ═══════════════════════════════════════════════════════════════════════
-- TEST 5 — BACKFILL REAL: un email + NULL (fixture BF2, ya cargada ANTES
-- de la migración). NO se vuelve a insertar nada aquí.
-- ═══════════════════════════════════════════════════════════════════════
do $test5_backfill_email_mas_null$
declare
  v_sales_total int;
  v_sales_sin_customer int;
  v_distinct_customer_ids int;
  v_customers_count int;
  v_customer_email text;
  v_sale_email_vieja text;
  v_sale_email_nueva text;
begin
  select count(*) into v_sales_total from public.sales where customer_document = 'P20A1-BF2-DOC';
  if v_sales_total <> 2 then
    raise exception 'TEST5_FAILED: se esperaban 2 ventas de la fixture BF2, hay % (¿corrió p20_20a1_predryrun_fixtures.sql?)', v_sales_total;
  end if;

  -- NUNCA usar array_position/= para buscar NULL (la igualdad con NULL no
  -- es verdadera nunca): se cuenta directo con IS NULL.
  select count(*) into v_sales_sin_customer
  from public.sales where customer_document = 'P20A1-BF2-DOC' and customer_id is null;
  if v_sales_sin_customer <> 0 then
    raise exception 'TEST5_FAILED: % venta(s) BF2 siguen con customer_id NULL', v_sales_sin_customer;
  end if;

  select count(distinct customer_id) into v_distinct_customer_ids
  from public.sales where customer_document = 'P20A1-BF2-DOC';
  if v_distinct_customer_ids <> 1 then
    raise exception 'TEST5_FAILED: las 2 ventas BF2 no comparten el MISMO customer_id (% distintos)', v_distinct_customer_ids;
  end if;

  select count(*) into v_customers_count from public.customers where document_number = 'P20A1-BF2-DOC';
  if v_customers_count <> 1 then
    raise exception 'TEST5_FAILED: se esperaba exactamente 1 customer para P20A1-BF2-DOC, hay %', v_customers_count;
  end if;

  -- Snapshots de CADA venta siguen siendo los originales (el backfill solo
  -- toca customer_id, nunca el resto).
  select customer_email into v_sale_email_vieja
  from public.sales where customer_document = 'P20A1-BF2-DOC' and created_at = '2026-01-01 09:00:00+00'::timestamptz;
  select customer_email into v_sale_email_nueva
  from public.sales where customer_document = 'P20A1-BF2-DOC' and created_at = '2026-01-02 09:00:00+00'::timestamptz;

  if v_sale_email_vieja is distinct from 'p20a1-bf2-viejo@example.invalid' then
    raise exception 'TEST5_FAILED: el snapshot de email de la venta más antigua cambió (llegó %)', v_sale_email_vieja;
  end if;
  if v_sale_email_nueva is not null then
    raise exception 'TEST5_FAILED: el snapshot de email de la venta más nueva cambió (llegó %, esperaba NULL)', v_sale_email_nueva;
  end if;

  -- El customer resultante debe conservar el email de la venta MÁS
  -- ANTIGUA (la que el backfill usa como fuente determinista al crear).
  select email into v_customer_email from public.customers where document_number = 'P20A1-BF2-DOC';
  if v_customer_email is distinct from 'p20a1-bf2-viejo@example.invalid' then
    raise exception 'TEST5_FAILED: el customer resultante no conservó el email de la venta más antigua (llegó %)', v_customer_email;
  end if;

  raise notice 'TEST5 OK: BF2 (un email + NULL) enlazada por el backfill real — mismo customer_id, 1 customer, email = venta más antigua, snapshots intactos';
end;
$test5_backfill_email_mas_null$;

-- ═══════════════════════════════════════════════════════════════════════
-- TEST 6 — ACL de erp_internal_resolve_or_create_customer_by_document,
-- resuelta por FIRMA EXACTA (regprocedure) y leída con aclexplode (nunca
-- LIKE ambiguo). Si la función no existe, el cast a regprocedure YA lanza
-- una excepción por sí solo.
-- ═══════════════════════════════════════════════════════════════════════
do $test6_acl$
declare
  v_oid oid := 'public.erp_internal_resolve_or_create_customer_by_document(text,text,text,text,text)'::regprocedure;
  v_acl aclitem[];
  v_entry record;
  v_public_execute boolean := false;
  v_anon_execute boolean := false;
  v_authenticated_execute boolean := false;
  v_postgres_execute boolean := false;
  v_service_role_execute boolean := false;
begin
  select proacl into v_acl from pg_proc where oid = v_oid;

  if v_acl is null then
    raise exception 'TEST6_FAILED: proacl es NULL para % — el default de Postgres (EXECUTE a PUBLIC) sigue vigente, falta el REVOKE', v_oid::regprocedure;
  end if;

  for v_entry in select * from aclexplode(v_acl) loop
    if v_entry.privilege_type <> 'EXECUTE' then
      continue;
    end if;
    if v_entry.grantee = 0 then
      v_public_execute := true;
    elsif v_entry.grantee = 'anon'::regrole then
      v_anon_execute := true;
    elsif v_entry.grantee = 'authenticated'::regrole then
      v_authenticated_execute := true;
    elsif v_entry.grantee = 'postgres'::regrole then
      v_postgres_execute := true;
    elsif v_entry.grantee = 'service_role'::regrole then
      v_service_role_execute := true;
    end if;
  end loop;

  if v_public_execute then raise exception 'TEST6_FAILED: PUBLIC (grantee oid 0) tiene EXECUTE'; end if;
  if v_anon_execute then raise exception 'TEST6_FAILED: anon tiene EXECUTE'; end if;
  if v_authenticated_execute then raise exception 'TEST6_FAILED: authenticated tiene EXECUTE'; end if;
  if not v_postgres_execute then raise exception 'TEST6_FAILED: postgres NO tiene EXECUTE'; end if;
  if not v_service_role_execute then raise exception 'TEST6_FAILED: service_role NO tiene EXECUTE'; end if;

  raise notice 'TEST6 OK: ACL de % — PUBLIC/anon/authenticated sin EXECUTE; postgres/service_role con EXECUTE', v_oid::regprocedure;
end;
$test6_acl$;

-- ═══════════════════════════════════════════════════════════════════════
-- TEST 7 — customers.list REAL, vía el dispatcher vivo
-- erp_agent_dispatch(uuid,text,jsonb,uuid). `p_profile_id`/`p_request_id`
-- son UUID ficticios generados aquí mismo — el dispatcher NO valida
-- `p_profile_id` contra `profiles` para una lectura (eso lo hace el
-- llamador `erp_agent_submit_request`, fuera de este test); nunca se
-- hardcodea un UUID de usuario real.
-- ═══════════════════════════════════════════════════════════════════════
do $test7_customers_list$
declare
  v_profile_id uuid := gen_random_uuid();
  v_policy jsonb;
  v_result jsonb;
  v_items jsonb;
  v_customer_id uuid;
  v_found boolean;
begin
  -- 7c. Policy — no requiere llamar al dispatcher.
  v_policy := public.erp_agent_action_policy('customers.list');
  if (v_policy->>'permission') is distinct from 'customers.manage' or (v_policy->>'risk') is distinct from 'read' then
    raise exception 'TEST7_FAILED: policy de customers.list incorrecta: %', v_policy;
  end if;

  -- 7a. limit=3 — items es array, y nunca trae más de 3.
  v_result := public.erp_agent_dispatch(v_profile_id, 'customers.list', jsonb_build_object('limit', 3), gen_random_uuid());
  v_items := v_result->'items';
  if v_items is null or jsonb_typeof(v_items) <> 'array' then
    raise exception 'TEST7_FAILED: result.items no es un array: %', v_result;
  end if;
  if jsonb_array_length(v_items) > 3 then
    raise exception 'TEST7_FAILED: se pidió limit=3 pero llegaron % items', jsonb_array_length(v_items);
  end if;

  -- 7b. query sobre un customer ficticio propio de este test (documento
  -- con marca "p20a1" para que el filtro de texto lo encuentre de forma
  -- inequívoca).
  if exists (select 1 from public.customers where document_number = 'P20A1-T7-DOC') then
    raise exception 'P20A1_FIXTURE_COLLISION: P20A1-T7-DOC ya existe en customers';
  end if;

  insert into public.customers (full_name, document_number, phone, email)
  values ('P20A1 Cliente Búsqueda Siete', 'P20A1-T7-DOC', '3070000007', 'p20a1-t7@example.invalid')
  returning id into v_customer_id;

  v_result := public.erp_agent_dispatch(v_profile_id, 'customers.list', jsonb_build_object('query', 'p20a1-t7'), gen_random_uuid());
  v_items := v_result->'items';
  if v_items is null or jsonb_typeof(v_items) <> 'array' then
    raise exception 'TEST7_FAILED: result.items (búsqueda) no es un array: %', v_result;
  end if;

  select exists (
    select 1 from jsonb_array_elements(v_items) it
    where (it->>'id')::uuid = v_customer_id
       or (it->>'customerId')::uuid = v_customer_id
  ) into v_found;

  if not v_found then
    raise exception 'TEST7_FAILED: la búsqueda "p20a1-t7" no devolvió el customer esperado (id=%): %', v_customer_id, v_result;
  end if;

  raise notice 'TEST7 OK: policy correcta, limit=3 respetado, búsqueda por documento encontró el customer ficticio %', v_customer_id;
end;
$test7_customers_list$;

-- ═══════════════════════════════════════════════════════════════════════
-- TEST 8 — caso de posventa LEGACY (fixture BF3, ya cargada ANTES de la
-- migración): after_sales_cases.customer_id sigue NULL (inmutable,
-- NUNCA se toca), sales.customer_id sí quedó enlazado por el backfill de
-- ventas, y customers.history (vía el dispatcher real) encuentra el caso
-- de todas formas, por sale_id.
-- ═══════════════════════════════════════════════════════════════════════
do $test8_caso_legacy$
declare
  v_sale_id uuid;
  v_sale_customer_id uuid;
  v_case_customer_id_after uuid;
  v_profile_id uuid := gen_random_uuid();
  v_result jsonb;
  v_cases jsonb;
  v_count_matches int;
  v_case_snapshot record;
begin
  select id, customer_id into v_sale_id, v_sale_customer_id
  from public.sales where customer_document = 'P20A1-BF3-DOC';

  if v_sale_id is null then
    raise exception 'TEST8_FAILED: no se encontró la venta de la fixture BF3 (¿corrió p20_20a1_predryrun_fixtures.sql?)';
  end if;
  if v_sale_customer_id is null then
    raise exception 'TEST8_FAILED: sales.customer_id de BF3 sigue NULL — el backfill de ventas no la enlazó';
  end if;

  select customer_id into v_case_customer_id_after
  from public.after_sales_cases where case_number = 'P20A1-CASE-BF3-LEGACY';

  if v_case_customer_id_after is not null then
    raise exception 'TEST8_FAILED: after_sales_cases.customer_id de BF3 dejó de ser NULL (se violó la inmutabilidad, llegó %)', v_case_customer_id_after;
  end if;

  -- Snapshot del caso intacto — el backfill NUNCA lo toca.
  select case_type, status, product_name_snapshot, unit_code_snapshot, customer_name_snapshot, customer_document_snapshot
    into v_case_snapshot
  from public.after_sales_cases where case_number = 'P20A1-CASE-BF3-LEGACY';

  if v_case_snapshot.product_name_snapshot is distinct from 'P20A1 Producto Legacy BF3'
     or v_case_snapshot.unit_code_snapshot is distinct from 'STU-P20A1BF3'
     or v_case_snapshot.customer_name_snapshot is distinct from 'P20A1 BF3 Nombre'
     or v_case_snapshot.customer_document_snapshot is distinct from 'P20A1-BF3-DOC' then
    raise exception 'TEST8_FAILED: algún snapshot del caso BF3 cambió: %', v_case_snapshot;
  end if;

  v_result := public.erp_agent_dispatch(v_profile_id, 'customers.history', jsonb_build_object('customerId', v_sale_customer_id), gen_random_uuid());
  v_cases := v_result->'afterSalesCases';

  if v_cases is null or jsonb_typeof(v_cases) <> 'array' then
    raise exception 'TEST8_FAILED: afterSalesCases no es un array: %', v_result;
  end if;

  select count(*) into v_count_matches
  from jsonb_array_elements(v_cases) it
  where it->>'caseNumber' = 'P20A1-CASE-BF3-LEGACY';

  if v_count_matches <> 1 then
    raise exception 'TEST8_FAILED: customers.history no devolvió el caso legacy BF3 exactamente 1 vez (llegó % veces): %', v_count_matches, v_cases;
  end if;

  raise notice 'TEST8 OK: caso legacy BF3 sigue con customer_id NULL (inmutable), sale.customer_id enlazado, customers.history lo encuentra vía sale_id';
end;
$test8_caso_legacy$;

-- ═══════════════════════════════════════════════════════════════════════
-- TEST 9 — caso de posventa MODERNO, por la ruta REAL de punta a punta:
--   1-2. producto + unidad 'available' (NUNCA 'sold' fabricado a mano);
--   3.   venta real (erp_internal_create_sale_with_units, itemType=catalog)
--        — es la propia función quien debe transicionar la unidad;
--   4.   assert: product_units.status='sold' y sold_at NOT NULL, puestos
--        por la función de venta, no por este test;
--   5.   el sale_item real de esa unidad (sale_id/product_unit_id
--        coherentes — nunca un sale_item manual desligado de una unidad
--        no relacionada);
--   6.   erp_internal_open_after_sales_case (la ruta normal real: exige
--        unit.status='sold', que YA lo está) — no un INSERT directo.
-- customers.history debe encontrar el caso — y SIN duplicarlo aunque
-- ac.customer_id (heredado de sale.customer_id al abrir) y la venta
-- enlazada apunten al mismo customer por las DOS ramas del OR a la vez.
-- ═══════════════════════════════════════════════════════════════════════
do $test9_caso_moderno$
declare
  v_admin_profile_id uuid;
  v_sale_id uuid;
  v_sale_customer_id uuid;
  v_product_id uuid;
  v_unit_id uuid;
  v_unit_status text;
  v_unit_sold_at timestamptz;
  v_sale_item_id uuid;
  v_sale_item_unit_id uuid;
  v_sale_item_sale_id uuid;
  v_case_id uuid;
  v_case_number text;
  v_profile_id uuid := gen_random_uuid();
  v_result jsonb;
  v_cases jsonb;
  v_count_matches int;
begin
  select id into v_admin_profile_id from public.profiles where is_admin = true order by id limit 1;
  if v_admin_profile_id is null then
    raise exception 'test_admin_profile_required';
  end if;
  perform set_config('request.jwt.claim.sub', v_admin_profile_id::text, true);
  if auth.uid() is distinct from v_admin_profile_id then
    raise exception 'TEST_AUTH_CONTEXT_FAILED';
  end if;

  if exists (select 1 from public.customers where document_number = 'P20A1-T9-DOC') then
    raise exception 'P20A1_FIXTURE_COLLISION: P20A1-T9-DOC ya existe en customers';
  end if;
  if exists (select 1 from public.product_units where unit_code = 'STU-P20A1T9') then
    raise exception 'P20A1_FIXTURE_COLLISION: STU-P20A1T9 ya existe en product_units';
  end if;

  -- 1-2. Producto + unidad DISPONIBLE — la venta real es quien la vende.
  insert into public.products (title) values ('P20A1 Producto Moderno T9') returning id into v_product_id;
  insert into public.product_units (product_id, unit_code, status)
  values (v_product_id, 'STU-P20A1T9', 'available') returning id into v_unit_id;

  -- 3. Venta moderna REAL, itemType=catalog sobre ESA unidad.
  v_sale_id := public.erp_internal_create_sale_with_units(
    null, 'P20A1 Cliente Moderno', 'P20A1-T9-DOC', '3090000009', 'p20a1-moderno9@example.invalid',
    jsonb_build_array(jsonb_build_object(
      'itemType', 'catalog', 'productId', v_product_id, 'productUnitId', v_unit_id,
      'unitPriceCop', 5000, 'quantity', 1
    )),
    0, 'efectivo', 'pagado', 6, null, gen_random_uuid()
  );

  select customer_id into v_sale_customer_id from public.sales where id = v_sale_id;
  if v_sale_customer_id is null then
    raise exception 'TEST9_FAILED: la venta moderna quedó con customer_id NULL (precondición inválida para este test)';
  end if;

  -- 4. La transición la hizo la FUNCIÓN DE VENTA real — nunca este test.
  select status, sold_at into v_unit_status, v_unit_sold_at from public.product_units where id = v_unit_id;
  if v_unit_status <> 'sold' then
    raise exception 'TEST9_FAILED: la unidad no quedó sold tras la venta real (status=%)', v_unit_status;
  end if;
  if v_unit_sold_at is null then
    raise exception 'TEST9_FAILED: sold_at quedó NULL tras la venta real (la función de venta debía asignarlo)';
  end if;

  -- 5. sale_item REAL, coherente con la unidad y la venta.
  select id, product_unit_id, sale_id into v_sale_item_id, v_sale_item_unit_id, v_sale_item_sale_id
  from public.sale_items where sale_id = v_sale_id and product_unit_id = v_unit_id;

  if v_sale_item_id is null then
    raise exception 'TEST9_FAILED: no se encontró un sale_item real para la unidad %', v_unit_id;
  end if;
  if v_sale_item_unit_id is distinct from v_unit_id then
    raise exception 'TEST9_FAILED: sale_item.product_unit_id (%) != v_unit_id (%)', v_sale_item_unit_id, v_unit_id;
  end if;
  if v_sale_item_sale_id is distinct from v_sale_id then
    raise exception 'TEST9_FAILED: sale_item.sale_id (%) != v_sale_id (%)', v_sale_item_sale_id, v_sale_id;
  end if;

  -- 6. Caso moderno por la RUTA NORMAL real — erp_internal_open_after_
  -- sales_case exige unit.status='sold' (ya lo está) y el mismo actor
  -- admin (ya en contexto). El case_number lo asigna la propia función
  -- (secuencia real) — nunca se inventa aquí.
  v_case_id := public.erp_internal_open_after_sales_case(
    v_sale_item_id, 'warranty', 'Falla de prueba P20A1 T9 (caso moderno, ruta normal)'
  );
  select case_number into v_case_number from public.after_sales_cases where id = v_case_id;

  v_result := public.erp_agent_dispatch(v_profile_id, 'customers.history', jsonb_build_object('customerId', v_sale_customer_id), gen_random_uuid());
  v_cases := v_result->'afterSalesCases';

  if v_cases is null or jsonb_typeof(v_cases) <> 'array' then
    raise exception 'TEST9_FAILED: afterSalesCases no es un array: %', v_result;
  end if;

  select count(*) into v_count_matches
  from jsonb_array_elements(v_cases) it
  where it->>'caseNumber' = v_case_number;

  if v_count_matches <> 1 then
    raise exception 'TEST9_FAILED: se esperaba el caso moderno % EXACTAMENTE 1 vez en afterSalesCases (ambas ramas del OR coinciden — no debe duplicar), apareció % veces: %', v_case_number, v_count_matches, v_cases;
  end if;

  raise notice 'TEST9 OK: unidad transicionada por la venta real (sold, sold_at), caso % abierto por erp_internal_open_after_sales_case, customers.history lo encuentra exactamente 1 vez', v_case_number;
end;
$test9_caso_moderno$;
