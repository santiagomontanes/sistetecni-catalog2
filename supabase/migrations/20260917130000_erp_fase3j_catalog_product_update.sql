-- P20.20E · Edición natural de información visible de publicaciones
--
-- Acción:
--   catalog.product.update
--
-- Campos permitidos inicialmente:
--   productId  UUID obligatorio
--   title      opcional → public.products.title
--   cpu        opcional → public.products.cpu
--
-- Reglas:
--   - al menos title o cpu debe venir presente;
--   - NO acepta nombres de columna arbitrarios;
--   - NO escribe en la columna legacy `procesador`;
--   - title/cpu se guardan literalmente como llegan en el JSON;
--   - risk=sensitive → pasa obligatoriamente por CONFIRMAR;
--   - actualiza title+cpu en UNA sola sentencia;
--   - devuelve snapshot before/after para trazabilidad;
--   - no toca ventas históricas ni snapshots de sale_items.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Política: escritura sensible de inventario/catálogo
-- ═══════════════════════════════════════════════════════════════════════

do $patch_policy_catalog_product_update$
declare
  v_oid oid;
  v_def text;
  v_needle text :=
    $$    when 'customers.list'                                 then jsonb_build_object('permission','customers.manage','risk','read')$$;
  v_replacement text :=
    $$    when 'customers.list'                                 then jsonb_build_object('permission','customers.manage','risk','read')
    when 'catalog.product.update'                          then jsonb_build_object('permission','inventory.manage','risk','sensitive')$$;
  v_ocurrencias integer;
begin
  select p.oid
    into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'erp_agent_action_policy'
  limit 1;

  if v_oid is null then
    raise exception 'P20_20E_action_policy_not_found';
  end if;

  v_def := pg_get_functiondef(v_oid);

  v_ocurrencias :=
    (length(v_def) - length(replace(v_def, v_needle, '')))
    / greatest(length(v_needle), 1);

  if v_ocurrencias = 0 then
    raise exception 'P20_20E_policy_anchor_not_found';
  end if;

  if v_ocurrencias > 1 then
    raise exception 'P20_20E_policy_anchor_not_unique:%', v_ocurrencias;
  end if;

  execute replace(v_def, v_needle, v_replacement);
end;
$patch_policy_catalog_product_update$;


-- ═══════════════════════════════════════════════════════════════════════
-- 2. Dispatcher
-- ═══════════════════════════════════════════════════════════════════════

do $patch_dispatch_catalog_product_update$
declare
  v_oid oid;
  v_def text;

  v_needle text :=
$needle$    else
      raise exception 'erp_agent_unknown_action:%',v_action;$needle$;

  v_replacement text :=
$replacement$    when 'catalog.product.update' then
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

    else
      raise exception 'erp_agent_unknown_action:%',v_action;$replacement$;

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
    raise exception 'P20_20E_dispatch_not_found';
  end if;

  v_def := pg_get_functiondef(v_oid);

  v_ocurrencias :=
    (length(v_def) - length(replace(v_def, v_needle, '')))
    / greatest(length(v_needle), 1);

  if v_ocurrencias = 0 then
    raise exception 'P20_20E_dispatch_anchor_not_found';
  end if;

  if v_ocurrencias > 1 then
    raise exception 'P20_20E_dispatch_anchor_not_unique:%', v_ocurrencias;
  end if;

  execute replace(v_def, v_needle, v_replacement);
end;
$patch_dispatch_catalog_product_update$;


-- ═══════════════════════════════════════════════════════════════════════
-- 3. Verificación estructural
-- ═══════════════════════════════════════════════════════════════════════

do $verify$
declare
  v_pol jsonb;
  v_dispatch_def text;
begin
  v_pol := public.erp_agent_action_policy('catalog.product.update');

  if (v_pol->>'permission') <> 'inventory.manage'
     or (v_pol->>'risk') <> 'sensitive' then
    raise exception
      'P20_20E_policy_catalog_product_update_failed:%',
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
     or v_dispatch_def not ilike '%updatedFields%'
     or v_dispatch_def not ilike '%''before''%'
     or v_dispatch_def not ilike '%''after''%' then
    raise exception 'P20_20E_dispatch_verification_failed';
  end if;

  -- La nueva rama jamás debe escribir la columna legacy `procesador`.
  if v_dispatch_def ilike
       '%catalog.product.update%procesador%erp_agent_unknown_action%' then
    raise exception 'P20_20E_legacy_procesador_must_not_be_used';
  end if;
end;
$verify$;
