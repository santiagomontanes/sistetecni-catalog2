-- P20.21A · La CREACIÓN de un producto persiste condición, descripción y garantía
--
-- Función afectada:
--   public.erp_publish_catalog_draft  (creada por 20260829191500, NO se edita)
--
-- ── QUÉ ARREGLA ─────────────────────────────────────────────────────────
-- Hasta aquí, `catalog.publish_draft` (CREACIÓN) no escribía:
--   condition    → la columna `public.products.condition` EXISTE y ya tiene
--                  escritor, pero SOLO por `catalog.product.update` (edición,
--                  P20.20E/G). Un producto creado por WhatsApp nacía sin ella.
--   description  → idéntico: `public.products.descripcion` EXISTE, se LEE en
--                  producción (el agente la usa para capacidades comerciales
--                  grounded) y se puede editar, pero no se podía rellenar al
--                  crear.
--   warrantyMonths → se validaba (rango 0..60) y se devolvía en el resultado
--                  y en la auditoría… y después se DESCARTABA: no existía
--                  ninguna columna donde guardarla. Hallazgo de la auditoría
--                  forense del 2026-09-18.
--
-- ── DECISIONES ──────────────────────────────────────────────────────────
--   - condition/descripcion: se REUTILIZAN las columnas existentes. NO se
--     crea `products.description` ni ninguna variante paralela: una sola
--     fuente de verdad por dato, leída por bot, PDF y web.
--   - warranty_months: es la ÚNICA columna genuinamente nueva de todo este
--     trabajo, porque no existía ningún equivalente real (`products` no
--     tenía dónde guardar la garantía).
--   - NUNCA se escriben las columnas legacy huérfanas `estado` ni
--     `procesador` (guardas explícitas más abajo, igual que P20.20E/G).
--   - Los valores de texto se escriben LITERALES: se valida longitud, no se
--     transforma (ni lower, ni initcap, ni trim en el UPDATE) — mismo
--     criterio que `catalog.product.update`.
--
-- Patrón: anchor exacto + replace + conteo de ocurrencias + $verify$,
-- idéntico al ya usado en 20260917130000 y 20260918000000.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Columna nueva: products.warranty_months
-- ═══════════════════════════════════════════════════════════════════════

alter table public.products
  add column if not exists warranty_months integer;

comment on column public.products.warranty_months is
  'Garantía en meses declarada al publicar (P20.21A). NULL = no declarada. Rango 0..60 impuesto por erp_publish_catalog_draft.';

do $constraint_warranty$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'products_warranty_months_rango'
  ) then
    alter table public.products
      add constraint products_warranty_months_rango
      check (warranty_months is null or (warranty_months >= 0 and warranty_months <= 60))
      not valid;
  end if;
end;
$constraint_warranty$;

-- `not valid` a propósito: no se re-verifican filas históricas (todas tienen
-- NULL, que la restricción acepta), pero toda escritura futura sí se valida.

-- ═══════════════════════════════════════════════════════════════════════
-- 2. Lectura y validación de los tres campos en la rama de PRODUCTO NUEVO
-- ═══════════════════════════════════════════════════════════════════════

do $patch_lectura_campos$
declare
  v_oid oid;
  v_def text;

  v_needle text :=
$needle_lectura$    v_brand  := nullif(btrim(coalesce(p_args->>'brand', '')), '');
    v_model  := nullif(btrim(coalesce(p_args->>'model', '')), '');
    v_cpu    := nullif(btrim(coalesce(p_args->>'cpu', '')), '');
    v_screen := nullif(btrim(coalesce(p_args->>'screen', '')), '');
    v_gpu    := nullif(btrim(coalesce(p_args->>'gpu', '')), '');
$needle_lectura$;

  v_replacement text :=
$replacement_lectura$    v_brand  := nullif(btrim(coalesce(p_args->>'brand', '')), '');
    v_model  := nullif(btrim(coalesce(p_args->>'model', '')), '');
    v_cpu    := nullif(btrim(coalesce(p_args->>'cpu', '')), '');
    v_screen := nullif(btrim(coalesce(p_args->>'screen', '')), '');
    v_gpu    := nullif(btrim(coalesce(p_args->>'gpu', '')), '');

    -- P20.21A — condición comercial y descripción. Se leen SIN normalizar:
    -- el valor que escribió el administrador se guarda literal (solo se
    -- descarta el vacío). Mismos límites que catalog.product.update.
    v_condition   := nullif(btrim(coalesce(p_args->>'condition', '')), '');
    v_description := nullif(btrim(coalesce(p_args->>'description', '')), '');

    if length(coalesce(v_condition, '')) > 200 then
      raise exception 'catalog_condition_too_long';
    end if;

    if length(coalesce(v_description, '')) > 2000 then
      raise exception 'catalog_description_too_long';
    end if;
$replacement_lectura$;

  v_ocurrencias integer;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'erp_publish_catalog_draft'
  limit 1;

  if v_oid is null then
    raise exception 'P20_21A_publish_draft_not_found';
  end if;

  v_def := pg_get_functiondef(v_oid);

  v_ocurrencias :=
    (length(v_def) - length(replace(v_def, v_needle, ''))) / greatest(length(v_needle), 1);

  if v_ocurrencias = 0 then
    raise exception 'P20_21A_lectura_anchor_not_found';
  end if;
  if v_ocurrencias > 1 then
    raise exception 'P20_21A_lectura_anchor_not_unique:%', v_ocurrencias;
  end if;

  -- Las variables nuevas se declaran junto a las de texto ya existentes.
  v_def := replace(
    v_def,
    '  v_storage_type text;',
    '  v_condition text;' || chr(10) || '  v_description text;' || chr(10) || '  v_storage_type text;'
  );

  execute replace(v_def, v_needle, v_replacement);
end;
$patch_lectura_campos$;


-- ═══════════════════════════════════════════════════════════════════════
-- 3. Escritura: las tres columnas entran en el INSERT de producto nuevo
-- ═══════════════════════════════════════════════════════════════════════

do $patch_insert_producto$
declare
  v_oid oid;
  v_def text;

  v_needle text :=
$needle_insert$    insert into public.products (
      title,
      brand,
      model,
      cpu,
      ram,
      storage,
      screen,
      price,
      stock,
      images,
      featured,
      visible_web,
      storage_gb,
      gpu_model,
      erp_stock_enabled,
      erp_stock_synced_at
    )
    values (
      v_title,
      v_brand,
      v_model,
      v_cpu,
      v_ram,
      v_storage_label,
      v_screen,
      v_price_cop,
      0,
      '{}'::text[],
      false,
      false,
      v_storage_gb,
      v_gpu,
      true,
      now()
    )$needle_insert$;

  v_replacement text :=
$replacement_insert$    insert into public.products (
      title,
      brand,
      model,
      cpu,
      ram,
      storage,
      screen,
      price,
      stock,
      images,
      featured,
      visible_web,
      storage_gb,
      gpu_model,
      condition,
      descripcion,
      warranty_months,
      erp_stock_enabled,
      erp_stock_synced_at
    )
    values (
      v_title,
      v_brand,
      v_model,
      v_cpu,
      v_ram,
      v_storage_label,
      v_screen,
      v_price_cop,
      0,
      '{}'::text[],
      false,
      false,
      v_storage_gb,
      v_gpu,
      v_condition,
      v_description,
      v_warranty_months,
      true,
      now()
    )$replacement_insert$;

  v_ocurrencias integer;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'erp_publish_catalog_draft'
  limit 1;

  if v_oid is null then
    raise exception 'P20_21A_publish_draft_not_found';
  end if;

  v_def := pg_get_functiondef(v_oid);

  v_ocurrencias :=
    (length(v_def) - length(replace(v_def, v_needle, ''))) / greatest(length(v_needle), 1);

  if v_ocurrencias = 0 then
    raise exception 'P20_21A_insert_anchor_not_found';
  end if;
  if v_ocurrencias > 1 then
    raise exception 'P20_21A_insert_anchor_not_unique:%', v_ocurrencias;
  end if;

  -- Autochequeo estático: lo que insertamos jamás menciona las columnas
  -- legacy huérfanas.
  if v_replacement ~* '\mprocesador\M' or v_replacement ~* '\mestado\M' then
    raise exception 'P20_21A_replacement_must_not_reference_legacy_columns';
  end if;

  execute replace(v_def, v_needle, v_replacement);
end;
$patch_insert_producto$;


-- ═══════════════════════════════════════════════════════════════════════
-- 4. Verificación estructural
-- ═══════════════════════════════════════════════════════════════════════

do $verify$
declare
  v_def text;
  v_tiene_columna boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'products' and column_name = 'warranty_months'
  ) into v_tiene_columna;

  if not v_tiene_columna then
    raise exception 'P20_21A_warranty_months_column_missing';
  end if;

  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'erp_publish_catalog_draft'
  limit 1;

  if v_def is null then
    raise exception 'P20_21A_publish_draft_not_found';
  end if;

  -- Variables declaradas y leídas.
  if v_def not like '%v_condition text;%'
     or v_def not like '%v_description text;%'
     or v_def not like '%p_args->>''condition''%'
     or v_def not like '%p_args->>''description''%' then
    raise exception 'P20_21A_lectura_verification_failed';
  end if;

  -- Validaciones de longitud presentes.
  if v_def not like '%catalog_condition_too_long%'
     or v_def not like '%catalog_description_too_long%' then
    raise exception 'P20_21A_validacion_verification_failed';
  end if;

  -- Las tres columnas entran de verdad en el INSERT.
  if v_def not like '%      condition,%'
     or v_def not like '%      descripcion,%'
     or v_def not like '%      warranty_months,%'
     or v_def not like '%      v_condition,%'
     or v_def not like '%      v_description,%'
     or v_def not like '%      v_warranty_months,%' then
    raise exception 'P20_21A_insert_verification_failed';
  end if;

  -- La función jamás debe escribir las columnas legacy huérfanas.
  if v_def ~* 'insert into public\.products[^;]*\mprocesador\M' then
    raise exception 'P20_21A_legacy_procesador_must_not_be_used';
  end if;

  if v_def ~* 'insert into public\.products[^;]*\mestado\M' then
    raise exception 'P20_21A_legacy_estado_must_not_be_used';
  end if;
end;
$verify$;
