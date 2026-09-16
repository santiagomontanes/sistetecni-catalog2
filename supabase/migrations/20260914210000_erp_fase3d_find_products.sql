-- P20.17-bis (corrección) · `inventory.find_products` — búsqueda READ-ONLY de
-- PRODUCTOS (public.products), no de unidades físicas.
--
-- ── POR QUÉ SÍ HACE FALTA UNA MIGRACIÓN (a diferencia de lo sugerido) ──────
-- Se evaluó resolver esto directamente en `service.ts` con el cliente admin,
-- sin tocar SQL. Se descartó: `erp_agent_submit_request` es la ÚNICA puerta
-- que verifica que el `wa_id` firmado corresponde a un OPERADOR ERP real con
-- permiso `inventory.read` (`erp_agent_operator_context` +
-- `erp_role_has_permission`) y que deduplica por `meta_message_id`. Saltarse
-- esa RPC para esta acción habría creado una segunda vía de lectura sin esas
-- dos garantías — inconsistente con CADA otra acción de solo lectura
-- (`inventory.find`, `inventory.summary`, …). Se prefiere una acción más,
-- protegida exactamente igual que las demás.
--
-- ── POR QUÉ NO ES UNA SEGUNDA COPIA DE `inventory.find` ────────────────────
-- `inventory.find` es unit-scoped (`product_units ⋈ products`): un producto
-- sin ninguna unidad recibida todavía es invisible para esa búsqueda — el
-- bug real que esta migración corrige. `inventory.find_products` consulta
-- `products` directamente, sin pasar por `product_units` en absoluto.
--
-- ── SEGUNDA REVISIÓN: el filtro ramGb/storageGb se SACÓ de aquí ───────────
-- La primera versión de esta migración filtraba `p.ram`/`p.storage_gb` en
-- SQL. Se revirtió: hay productos HISTÓRICOS con `storage_gb IS NULL` pero
-- `storage` (texto libre, ej. "500 GB SSD") sí poblado — un filtro SQL
-- `storage_gb = N` los descarta en silencio, como si el producto no
-- coincidiera, cuando en realidad el dato estructurado simplemente no existe
-- todavía (nadie lo migró). Esta acción ahora se limita a lo que puede
-- responder con certeza — "¿qué productos calzan con este NOMBRE?" — y deja
-- la clasificación match/mismatch/desconocido de RAM/almacenamiento para
-- `resolverProductoPorNombre()` (agente, `src/erp/resolucion-producto.js`),
-- que sí puede distinguir "no coincide" de "no se sabe" y nunca asume que un
-- NULL es una coincidencia. Ver también `products.storage` en el resultado:
-- información visible para el administrador, nunca escrita ni inferida aquí.
--
-- ── PATRÓN: extender sin copiar/reinventar (igual que P20.17C) ────────────
-- Se reutiliza el mismo mecanismo de `20260829191500_erp_fase3c_catalog_
-- publish_draft.sql`: leer la definición VIVA de la función con
-- `pg_get_functiondef`, localizar un ancla exacta y reemplazarla — nunca se
-- reescribe el CASE completo a mano (evita perder ramas de fases previas por
-- una transcripción manual incompleta).
--
-- ── NO SE FILTRA POR `visible_web` ─────────────────────────────────────────
-- Una unidad puede llegar físicamente para un producto que todavía está
-- oculto del catálogo web (P20.17C lo crea así por defecto). `visibleWeb` se
-- devuelve como DATO, nunca como filtro.

-- --------------------------------------------------------------------------
-- 1. Extender la política de acciones
-- --------------------------------------------------------------------------

do $patch_policy$
declare
  v_oid oid;
  v_def text;
  v_needle text :=
    $$    when 'catalog.publish_draft'                          then jsonb_build_object('permission','inventory.manage','risk','sensitive')$$;
  v_replacement text :=
    $$    when 'catalog.publish_draft'                          then jsonb_build_object('permission','inventory.manage','risk','sensitive')
    when 'inventory.find_products'                        then jsonb_build_object('permission','inventory.read','risk','read')$$;
begin
  select p.oid
    into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'erp_agent_action_policy'
  limit 1;

  if v_oid is null then
    raise exception 'P20_17BIS_action_policy_not_found';
  end if;

  v_def := pg_get_functiondef(v_oid);

  if position(v_needle in v_def) = 0 then
    raise exception 'P20_17BIS_action_policy_patch_anchor_not_found';
  end if;

  execute replace(v_def, v_needle, v_replacement);
end;
$patch_policy$;

-- --------------------------------------------------------------------------
-- 2. Extender el dispatcher — nueva rama de solo lectura sobre `products`
--
-- Argumento aceptado en `p_arguments`: SOLO `query` (obligatorio, texto,
-- mínimo 2 caracteres tras recortar espacios). Sin `ramGb`/`storageGb` aquí
-- — ver nota de cabecera: esa decisión se tomó fuera de SQL, donde SÍ se
-- puede distinguir "no coincide" de "el dato no está registrado".
--
-- Coincidencia por NOMBRE: CADA palabra de `query` debe aparecer como
-- subcadena en "title + brand + model" (AND de palabras, no una sola
-- subcadena literal) — así "Acer P2" encuentra "Acer TravelMate P2" aunque
-- las palabras no queden contiguas, algo que `inventory.find` (subcadena
-- única) no permite.
--
-- Devuelve `ram` y `storage_gb` (estructurados, pueden venir NULL en
-- productos históricos) y también `storage` (texto libre, ej. "500 GB SSD")
-- — el agente lo usa para responder con transparencia cuando el dato
-- estructurado falta, nunca para inferir un número.
--
-- Nunca expone campos sensibles: ni costos, ni proveedor, ni columnas
-- huérfanas (`almacenamiento`/`procesador`/`marca`/`categoria`/`descripcion`/
-- `estado` — ver 20260812220000_baseline_esquema_actual.sql).
-- --------------------------------------------------------------------------

do $patch_dispatch$
declare
  v_oid oid;
  v_def text;

  v_needle text :=
$needle$    when 'catalog.publish_draft' then
      v_result := public.erp_publish_catalog_draft($1, $4, v_args);

    else
      raise exception 'erp_agent_unknown_action:%',v_action;$needle$;

  v_replacement text :=
$replacement$    when 'catalog.publish_draft' then
      v_result := public.erp_publish_catalog_draft($1, $4, v_args);

    when 'inventory.find_products' then
      v_q:=lower(btrim(coalesce(v_args->>'query','')));
      if length(v_q)<2 then raise exception 'erp_agent_query_too_short'; end if;
      select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)) into v_result
      from (
        select p.id as "productId", p.title, p.brand, p.model, p.cpu, p.ram,
               p.storage, p.storage_gb as "storageGb", p.gpu_model as "gpu",
               p.screen, p.price,
               coalesce(p.visible_web,false) as "visibleWeb",
               coalesce(p.erp_stock_enabled,false) as "erpStockEnabled"
        from public.products p
        where (
          select bool_and(
            lower(coalesce(p.title,'')||' '||coalesce(p.brand,'')||' '||coalesce(p.model,''))
            like '%'||w||'%'
          )
          from unnest(string_to_array(v_q,' ')) as w
          where length(w)>0
        )
        order by p.created_at desc
        limit 20
      ) x;

    else
      raise exception 'erp_agent_unknown_action:%',v_action;$replacement$;
begin
  select p.oid
    into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'erp_agent_dispatch'
    and oidvectortypes(p.proargtypes) =
      'uuid, text, jsonb, uuid'
  limit 1;

  if v_oid is null then
    raise exception 'P20_17BIS_dispatch_not_found';
  end if;

  v_def := pg_get_functiondef(v_oid);

  if position(v_needle in v_def) = 0 then
    raise exception 'P20_17BIS_dispatch_patch_anchor_not_found';
  end if;

  execute replace(v_def, v_needle, v_replacement);
end;
$patch_dispatch$;

-- --------------------------------------------------------------------------
-- 3. Guardas de instalación
-- --------------------------------------------------------------------------

do $verify$
declare
  v_policy jsonb;
  v_dispatch_def text;
begin
  select public.erp_agent_action_policy('inventory.find_products')
    into v_policy;

  if coalesce(v_policy->>'permission', '') <> 'inventory.read'
     or coalesce(v_policy->>'risk', '') <> 'read' then
    raise exception
      'P20_17BIS_action_policy_verification_failed:%',
      v_policy;
  end if;

  select pg_get_functiondef(p.oid)
    into v_dispatch_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'erp_agent_dispatch'
    and oidvectortypes(p.proargtypes) =
      'uuid, text, jsonb, uuid'
  limit 1;

  if v_dispatch_def not ilike '%inventory.find_products%'
     or v_dispatch_def not ilike '%erp_stock_enabled%' then
    raise exception 'P20_17BIS_dispatch_verification_failed';
  end if;
end;
$verify$;
