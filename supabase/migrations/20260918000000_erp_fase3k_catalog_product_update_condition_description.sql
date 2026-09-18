-- P20.20G · Extiende la edición natural de publicaciones (P20.20E) con
-- condición y descripción comercial.
--
-- Acción:
--   catalog.product.update  (misma acción de 20260917130000, no se crea otra)
--
-- Campos permitidos ahora:
--   productId    UUID obligatorio
--   title        opcional → public.products.title       (sin cambios)
--   cpu          opcional → public.products.cpu          (sin cambios)
--   condition    opcional → public.products.condition    (NUEVO)
--   description  opcional → public.products.descripcion  (NUEVO; la clave de
--                API es en inglés, la columna real es en español — mapeo,
--                nunca se crea columna nueva)
--
-- Reglas:
--   - al menos uno de title/cpu/condition/description debe venir presente;
--   - NO acepta nombres de columna arbitrarios;
--   - NO escribe en las columnas legacy `procesador` ni `estado`;
--   - condition/description se guardan literalmente como llegan en el JSON;
--   - risk=sensitive / permission=inventory.manage → SIN CAMBIOS (ya quedó
--     fijado por 20260917130000, esta migración no toca la política);
--   - actualiza los 4 campos en UNA sola sentencia cuando vienen varios;
--   - devuelve snapshot before/after de los 4 campos para trazabilidad;
--   - `updatedFields` solo lista los campos que de verdad viajaron.
--
-- NO se modifica supabase/migrations/20260917130000_erp_fase3j_catalog_product_update.sql
-- (migración histórica). Esta migración parchea EXCLUSIVAMENTE la rama
-- `catalog.product.update` ya existente que esa migración introdujo,
-- ancorando en el CUERPO EXACTO de esa rama — nunca en el `else` genérico
-- de `erp_agent_unknown_action`, que sigue perteneciendo a otra migración
-- y no debe alterarse ni usarse como anchor aquí.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Dispatcher: extiende la rama catalog.product.update con condition/description
-- ═══════════════════════════════════════════════════════════════════════

do $patch_dispatch_catalog_product_update_condition_description$
declare
  v_oid oid;
  v_def text;

  -- Anchor: el CUERPO EXACTO de la rama catalog.product.update tal como la
  -- dejó 20260917130000 (P20.20E), sin tocar el `else` que la sigue.
  v_needle text :=
$needle_v2$    when 'catalog.product.update' then
      -- productId siempre debe venir resuelto contra el catálogo REAL.
      if nullif(btrim(coalesce(v_args->>'productId','')),'') is null then
        raise exception 'catalog_product_update_product_id_required';
      end if;

      -- Solo se permiten productId + title/cpu en P20.20E.
      if not (v_args ? 'title') and not (v_args ? 'cpu') then
        raise exception 'catalog_product_update_no_fields';
      end if;

      if exists (
        select 1
        from jsonb_object_keys(v_args) as k(key)
        where k.key not in ('productId', 'title', 'cpu')
      ) then
        raise exception 'catalog_product_update_unknown_fields';
      end if;

      -- `title` se valida, pero se ESCRIBE exactamente como llegó:
      -- no lower(), no initcap(), no trim() durante el UPDATE.
      if v_args ? 'title' then
        if coalesce(jsonb_typeof(v_args->'title'),'null') <> 'string' then
          raise exception 'catalog_product_update_invalid_title_type';
        end if;

        if char_length(btrim(v_args->>'title')) < 2
           or char_length(v_args->>'title') > 200 then
          raise exception 'catalog_product_update_invalid_title';
        end if;
      end if;

      -- Igual para CPU: texto literal del administrador.
      if v_args ? 'cpu' then
        if coalesce(jsonb_typeof(v_args->'cpu'),'null') <> 'string' then
          raise exception 'catalog_product_update_invalid_cpu_type';
        end if;

        if char_length(btrim(v_args->>'cpu')) < 1
           or char_length(v_args->>'cpu') > 200 then
          raise exception 'catalog_product_update_invalid_cpu';
        end if;
      end if;

      -- Snapshot BEFORE + bloqueo de la fila hasta completar el UPDATE.
      select jsonb_build_object(
        'productId', p.id,
        'before', jsonb_build_object(
          'title', p.title,
          'cpu', p.cpu
        )
      )
      into v_result
      from public.products p
      where p.id = (v_args->>'productId')::uuid
      for update;

      if v_result is null then
        raise exception 'product_not_found';
      end if;

      -- Un único UPDATE: si vienen ambos campos, cambian atómicamente.
      update public.products
      set
        title = case
          when v_args ? 'title' then v_args->>'title'
          else title
        end,
        cpu = case
          when v_args ? 'cpu' then v_args->>'cpu'
          else cpu
        end
      where id = (v_args->>'productId')::uuid
      returning
        v_result || jsonb_build_object(
          'after', jsonb_build_object(
            'title', title,
            'cpu', cpu
          ),
          'updatedFields',
            to_jsonb(
              array_remove(
                array[
                  case when v_args ? 'title' then 'title' end,
                  case when v_args ? 'cpu' then 'cpu' end
                ],
                null
              )
            )
        )
      into v_result;
$needle_v2$;

  -- Reemplazo: mismo arranque de rama, extendido con condition/description.
  v_replacement text :=
$replacement_v2$    when 'catalog.product.update' then
      -- productId siempre debe venir resuelto contra el catálogo REAL.
      if nullif(btrim(coalesce(v_args->>'productId','')),'') is null then
        raise exception 'catalog_product_update_product_id_required';
      end if;

      -- P20.20G: ahora también condition/description cuentan como campo válido.
      if not (v_args ? 'title') and not (v_args ? 'cpu')
         and not (v_args ? 'condition') and not (v_args ? 'description') then
        raise exception 'catalog_product_update_no_fields';
      end if;

      if exists (
        select 1
        from jsonb_object_keys(v_args) as k(key)
        where k.key not in ('productId', 'title', 'cpu', 'condition', 'description')
      ) then
        raise exception 'catalog_product_update_unknown_fields';
      end if;

      -- `title` se valida, pero se ESCRIBE exactamente como llegó:
      -- no lower(), no initcap(), no trim() durante el UPDATE.
      if v_args ? 'title' then
        if coalesce(jsonb_typeof(v_args->'title'),'null') <> 'string' then
          raise exception 'catalog_product_update_invalid_title_type';
        end if;

        if char_length(btrim(v_args->>'title')) < 2
           or char_length(v_args->>'title') > 200 then
          raise exception 'catalog_product_update_invalid_title';
        end if;
      end if;

      -- Igual para CPU: texto literal del administrador.
      if v_args ? 'cpu' then
        if coalesce(jsonb_typeof(v_args->'cpu'),'null') <> 'string' then
          raise exception 'catalog_product_update_invalid_cpu_type';
        end if;

        if char_length(btrim(v_args->>'cpu')) < 1
           or char_length(v_args->>'cpu') > 200 then
          raise exception 'catalog_product_update_invalid_cpu';
        end if;
      end if;

      -- `condition` (condición física/comercial declarada): texto literal,
      -- se valida pero se ESCRIBE exactamente como llegó: no lower(),
      -- no initcap(), no trim() durante el UPDATE.
      if v_args ? 'condition' then
        if coalesce(jsonb_typeof(v_args->'condition'),'null') <> 'string' then
          raise exception 'catalog_product_update_invalid_condition_type';
        end if;

        if char_length(btrim(v_args->>'condition')) < 2
           or char_length(v_args->>'condition') > 200 then
          raise exception 'catalog_product_update_invalid_condition';
        end if;
      end if;

      -- `description` llega con clave de API en inglés, pero se guarda en la
      -- columna real `public.products.descripcion` (mapeo, no columna nueva).
      -- Texto literal: se valida pero se ESCRIBE tal como llegó.
      if v_args ? 'description' then
        if coalesce(jsonb_typeof(v_args->'description'),'null') <> 'string' then
          raise exception 'catalog_product_update_invalid_description_type';
        end if;

        if char_length(btrim(v_args->>'description')) < 2
           or char_length(v_args->>'description') > 2000 then
          raise exception 'catalog_product_update_invalid_description';
        end if;
      end if;

      -- Snapshot BEFORE + bloqueo de la fila hasta completar el UPDATE.
      -- Claves de API: 'condition' y 'description' (aunque la columna física
      -- de la segunda sea `descripcion`).
      select jsonb_build_object(
        'productId', p.id,
        'before', jsonb_build_object(
          'title', p.title,
          'cpu', p.cpu,
          'condition', p.condition,
          'description', p.descripcion
        )
      )
      into v_result
      from public.products p
      where p.id = (v_args->>'productId')::uuid
      for update;

      if v_result is null then
        raise exception 'product_not_found';
      end if;

      -- Un único UPDATE: los campos que vinieron cambian atómicamente.
      -- Las columnas legacy huérfanas nunca se modifican en esta acción.
      update public.products
      set
        title = case
          when v_args ? 'title' then v_args->>'title'
          else title
        end,
        cpu = case
          when v_args ? 'cpu' then v_args->>'cpu'
          else cpu
        end,
        condition = case
          when v_args ? 'condition' then v_args->>'condition'
          else condition
        end,
        descripcion = case
          when v_args ? 'description' then v_args->>'description'
          else descripcion
        end
      where id = (v_args->>'productId')::uuid
      returning
        v_result || jsonb_build_object(
          'after', jsonb_build_object(
            'title', title,
            'cpu', cpu,
            'condition', condition,
            'description', descripcion
          ),
          'updatedFields',
            to_jsonb(
              array_remove(
                array[
                  case when v_args ? 'title' then 'title' end,
                  case when v_args ? 'cpu' then 'cpu' end,
                  case when v_args ? 'condition' then 'condition' end,
                  case when v_args ? 'description' then 'description' end
                ],
                null
              )
            )
        )
      into v_result;
$replacement_v2$;

  v_ocurrencias integer;
begin
  select p.oid
    into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'erp_agent_dispatch'
    and oidvectortypes(p.proargtypes) = 'uuid, text, jsonb, uuid'
  limit 1;

  if v_oid is null then
    raise exception 'P20_20G_dispatch_not_found';
  end if;

  v_def := pg_get_functiondef(v_oid);

  v_ocurrencias :=
    (length(v_def) - length(replace(v_def, v_needle, '')))
    / greatest(length(v_needle), 1);

  if v_ocurrencias = 0 then
    raise exception 'P20_20G_dispatch_anchor_not_found';
  end if;

  if v_ocurrencias > 1 then
    raise exception 'P20_20G_dispatch_anchor_not_unique:%', v_ocurrencias;
  end if;

  -- Autochequeo estático: el propio texto que vamos a insertar jamás debe
  -- mencionar las columnas legacy huérfanas.
  if v_replacement ilike '%procesador%' or v_replacement ilike '%products.estado%'
     or v_replacement ilike '%\.estado%' then
    raise exception 'P20_20G_replacement_must_not_reference_legacy_columns';
  end if;

  execute replace(v_def, v_needle, v_replacement);
end;
$patch_dispatch_catalog_product_update_condition_description$;


-- ═══════════════════════════════════════════════════════════════════════
-- 2. Verificación estructural
-- ═══════════════════════════════════════════════════════════════════════

do $verify$
declare
  v_pol jsonb;
  v_dispatch_def text;
begin
  -- La política NO cambia en esta migración: sigue exactamente como la
  -- dejó 20260917130000.
  v_pol := public.erp_agent_action_policy('catalog.product.update');

  if (v_pol->>'permission') <> 'inventory.manage'
     or (v_pol->>'risk') <> 'sensitive' then
    raise exception
      'P20_20G_policy_catalog_product_update_unexpectedly_changed:%',
      v_pol;
  end if;

  select pg_get_functiondef(p.oid)
    into v_dispatch_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'erp_agent_dispatch'
    and oidvectortypes(p.proargtypes) = 'uuid, text, jsonb, uuid'
  limit 1;

  if v_dispatch_def not ilike '%catalog.product.update%'
     or v_dispatch_def not ilike '%catalog_product_update_no_fields%'
     or v_dispatch_def not ilike '%catalog_product_update_unknown_fields%'
     or v_dispatch_def not ilike '%catalog_product_update_invalid_condition%'
     or v_dispatch_def not ilike '%catalog_product_update_invalid_description%'
     or v_dispatch_def not ilike '%updatedFields%'
     or v_dispatch_def not ilike '%''before''%'
     or v_dispatch_def not ilike '%''after''%'
     or v_dispatch_def not ilike '%''condition''%'
     or v_dispatch_def not ilike '%''description''%'
     or v_dispatch_def not ilike '%p.descripcion%'
     or v_dispatch_def not ilike '%descripcion = case%' then
    raise exception 'P20_20G_dispatch_verification_failed';
  end if;

  -- La rama extendida jamás debe escribir las columnas legacy huérfanas.
  if v_dispatch_def ilike
       '%catalog.product.update%procesador%erp_agent_unknown_action%' then
    raise exception 'P20_20G_legacy_procesador_must_not_be_used';
  end if;

  if v_dispatch_def ilike
       '%catalog.product.update%products.estado%erp_agent_unknown_action%' then
    raise exception 'P20_20G_legacy_estado_must_not_be_used';
  end if;
end;
$verify$;
