-- P20.19 · Fotos por WhatsApp — galería de PRODUCTO y de UNIDAD (STU).
--
-- ── AUDITORÍA PREVIA (contra STAGING real, no solo migraciones históricas) ─
-- Se consultó `gwvjubkjdkpadetypzrj` directamente (psql) antes de escribir
-- esto, siguiendo la lección de P20.18: una migración histórica NO garantiza
-- el estado instalado.
--   - `products.images text[]` y `product_units.images text[]` YA existen —
--     no se crea ninguna tabla nueva. `ProductCard.tsx` ya usa
--     `images[0]` como portada — "ponla de principal" = mover al índice 0,
--     convención YA vigente, no inventada aquí.
--   - `erp_catalog_draft_publications` es SOLO idempotencia de
--     `catalog.publish_draft` (P20.17C) — no aplica a fotos de un producto
--     YA publicado, que es el caso central de esta fase.
--   - `catalogMedia.ts`/`catalogFinalize.ts`/`publicacion-media.js` son el
--     pipeline de subida REAL (hash, HMAC, bucket `products`, borrado
--     duplicado) — pero están cerrados al ciclo de vida del draft (exigen
--     una fila de `erp_catalog_draft_publications` YA completada). Esta
--     fase NO reescribe ese pipeline: reutiliza sus mismas primitivas
--     (hash/MIME/tamaño/bucket) para un caso de uso distinto (producto ya
--     existente), con su propia puerta de autorización (el producto/unidad
--     debe EXISTIR, no que haya un draft publicado).
--   - Bucket `products` (único bucket de catálogo): público, política RLS
--     exige `profiles.is_admin=true` para insert/update/delete — el agente
--     sube SIEMPRE con el cliente admin (service_role), nunca con RLS de
--     usuario — igual que el pipeline de drafts.
--
-- ── DISEÑO: SQL NO TOCA STORAGE ─────────────────────────────────────────
-- Subir un binario a Supabase Storage no se puede hacer desde PL/pgSQL. El
-- patrón ya usado por `catalog.publish_draft` (P20.17C) separa dos fases:
--   1. La orden JSON (`catalog.media.add`, etc.) pasa por el mismo
--      `erp_agent_submit_request`/`erp_agent_confirm_request` que CUALQUIER
--      otra escritura — mismo permiso, mismo CONFIRMAR, misma idempotencia
--      por `meta_message_id`. El dispatcher SOLO valida que el producto/
--      unidad EXISTE (defensa en profundidad — el agente ya lo resolvió
--      antes por lectura) y devuelve una marca `ready_for_media_
--      finalization` — NUNCA toca `products.images`/`product_units.images`
--      aquí.
--   2. Tras el CONFIRMAR real, el agente sube cada foto (ya descargada y
--      hasheada localmente) al bucket `products` vía una ruta HTTP interna
--      nueva, y una función TS (NO SQL — mismo patrón que
--      `finalizeCatalogDraft`) hace la mutación real de la galería. La
--      atomicidad de ESA mutación es la misma que ya acepta el sistema para
--      `products.images` (lectura+escritura, no una transacción SQL) — no
--      se inventa una garantía que el propio `catalog.publish_draft`
--      tampoco tiene para media.
--
-- ── GUARDA FUERTE (mismo patrón que P20.18) ────────────────────────────
-- Ancla verificada por ocurrencia EXACTA contra la definición VIVA leída
-- justo antes de parchear — no se asume el contenido de una migración
-- anterior.
--
-- ── P20.19-bis (corrección tras auditoría) ─────────────────────────────
-- `imageUrls`/`imageUrl` de las órdenes JSON pre-CONFIRMAR se sustituyeron
-- por `mediaCount` (agent-side, `acciones.js`) — el dispatcher de ESTA
-- migración nunca leyó `imageUrls` para add/replace/unit_add/unit_replace,
-- así que no hace falta tocarlo aquí. `set_primary` sí sigue leyendo
-- `imageUrl` cuando la foto YA está en la galería (referencia real, nunca
-- inventada) — eso no cambia. Se agregan 3 acciones nuevas: `catalog.media.
-- remove` (quitar UNA foto por referencia real), `catalog.media.list` /
-- `inventory.unit_media.list` (lectura de la galería real — base para "la
-- tercera"/"pon la primera de principal" en el turno siguiente).

do $patch_policy$
declare
  v_oid oid;
  v_def text;
  v_needle text :=
    $$    when 'inventory.transition_units'                     then jsonb_build_object('permission','inventory.manage','risk','write')$$;
  v_replacement text :=
    $$    when 'inventory.transition_units'                     then jsonb_build_object('permission','inventory.manage','risk','write')
    when 'catalog.media.add'                              then jsonb_build_object('permission','inventory.manage','risk','sensitive')
    when 'catalog.media.replace'                          then jsonb_build_object('permission','inventory.manage','risk','sensitive')
    when 'catalog.media.remove_all'                       then jsonb_build_object('permission','inventory.manage','risk','sensitive')
    when 'catalog.media.set_primary'                      then jsonb_build_object('permission','inventory.manage','risk','write')
    when 'catalog.media.remove'                           then jsonb_build_object('permission','inventory.manage','risk','sensitive')
    when 'catalog.media.list'                             then jsonb_build_object('permission','inventory.read','risk','read')
    when 'inventory.unit_media.add'                       then jsonb_build_object('permission','inventory.manage','risk','sensitive')
    when 'inventory.unit_media.replace'                   then jsonb_build_object('permission','inventory.manage','risk','sensitive')
    when 'inventory.unit_media.list'                      then jsonb_build_object('permission','inventory.read','risk','read')$$;
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
    raise exception 'P20_19_action_policy_not_found';
  end if;

  v_def := pg_get_functiondef(v_oid);

  v_ocurrencias := (length(v_def) - length(replace(v_def, v_needle, ''))) / greatest(length(v_needle), 1);
  if v_ocurrencias = 0 then
    raise exception 'P20_19_action_policy_patch_anchor_not_found';
  end if;
  if v_ocurrencias > 1 then
    raise exception 'P20_19_action_policy_patch_anchor_not_unique:%', v_ocurrencias;
  end if;

  execute replace(v_def, v_needle, v_replacement);
end;
$patch_policy$;

do $patch_dispatch$
declare
  v_oid oid;
  v_def text;

  v_needle text :=
$needle$    else
      raise exception 'erp_agent_unknown_action:%',v_action;$needle$;

  v_replacement text :=
$replacement$    when 'catalog.media.add' then
      if not exists (select 1 from public.products where id = (v_args->>'productId')::uuid) then
        raise exception 'product_not_found';
      end if;
      v_result := jsonb_build_object('status','ready_for_media_finalization','operation','add','productId',v_args->>'productId');

    when 'catalog.media.replace' then
      if not exists (select 1 from public.products where id = (v_args->>'productId')::uuid) then
        raise exception 'product_not_found';
      end if;
      v_result := jsonb_build_object('status','ready_for_media_finalization','operation','replace','productId',v_args->>'productId');

    when 'catalog.media.remove_all' then
      if not exists (select 1 from public.products where id = (v_args->>'productId')::uuid) then
        raise exception 'product_not_found';
      end if;
      v_result := jsonb_build_object('status','ready_for_media_finalization','operation','remove_all','productId',v_args->>'productId');

    when 'catalog.media.set_primary' then
      if not exists (select 1 from public.products where id = (v_args->>'productId')::uuid) then
        raise exception 'product_not_found';
      end if;
      v_result := jsonb_build_object('status','ready_for_media_finalization','operation','set_primary','productId',v_args->>'productId','imageUrl',v_args->>'imageUrl');

    when 'inventory.unit_media.add' then
      if not exists (select 1 from public.product_units where upper(unit_code) = upper(btrim(coalesce(v_args->>'unitCode','')))) then
        raise exception 'unit_not_found';
      end if;
      v_result := jsonb_build_object('status','ready_for_media_finalization','operation','unit_add','unitCode',upper(btrim(v_args->>'unitCode')));

    when 'inventory.unit_media.replace' then
      if not exists (select 1 from public.product_units where upper(unit_code) = upper(btrim(coalesce(v_args->>'unitCode','')))) then
        raise exception 'unit_not_found';
      end if;
      v_result := jsonb_build_object('status','ready_for_media_finalization','operation','unit_replace','unitCode',upper(btrim(v_args->>'unitCode')));

    when 'catalog.media.remove' then
      if not exists (select 1 from public.products where id = (v_args->>'productId')::uuid) then
        raise exception 'product_not_found';
      end if;
      v_result := jsonb_build_object('status','ready_for_media_finalization','operation','remove','productId',v_args->>'productId','imageUrl',v_args->>'imageUrl');

    when 'catalog.media.list' then
      select jsonb_build_object('scope','product','productId',p.id::text,'images',coalesce(to_jsonb(p.images),'[]'::jsonb))
        into v_result
      from public.products p
      where p.id = (v_args->>'productId')::uuid;
      if v_result is null then
        raise exception 'product_not_found';
      end if;

    when 'inventory.unit_media.list' then
      select jsonb_build_object('scope','unit','unitCode',u.unit_code,'images',coalesce(to_jsonb(u.images),'[]'::jsonb))
        into v_result
      from public.product_units u
      where upper(u.unit_code) = upper(btrim(coalesce(v_args->>'unitCode','')));
      if v_result is null then
        raise exception 'unit_not_found';
      end if;

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
    raise exception 'P20_19_dispatch_not_found';
  end if;

  v_def := pg_get_functiondef(v_oid);

  v_ocurrencias := (length(v_def) - length(replace(v_def, v_needle, ''))) / greatest(length(v_needle), 1);
  if v_ocurrencias = 0 then
    raise exception 'P20_19_dispatch_patch_anchor_not_found';
  end if;
  if v_ocurrencias > 1 then
    raise exception 'P20_19_dispatch_patch_anchor_not_unique:%', v_ocurrencias;
  end if;

  execute replace(v_def, v_needle, v_replacement);
end;
$patch_dispatch$;

do $verify$
declare
  v_pols jsonb;
  v_dispatch_def text;
begin
  select jsonb_object_agg(a, public.erp_agent_action_policy(a))
    into v_pols
  from unnest(array[
    'catalog.media.add','catalog.media.replace','catalog.media.remove_all','catalog.media.remove',
    'catalog.media.set_primary','catalog.media.list',
    'inventory.unit_media.add','inventory.unit_media.replace','inventory.unit_media.list'
  ]) as a;

  if (v_pols->'catalog.media.add'->>'permission') <> 'inventory.manage'
     or (v_pols->'catalog.media.add'->>'risk') <> 'sensitive' then
    raise exception 'P20_19_policy_media_add_failed:%', v_pols->'catalog.media.add';
  end if;
  if (v_pols->'catalog.media.remove'->>'permission') <> 'inventory.manage'
     or (v_pols->'catalog.media.remove'->>'risk') <> 'sensitive' then
    raise exception 'P20_19_policy_media_remove_failed:%', v_pols->'catalog.media.remove';
  end if;
  if (v_pols->'catalog.media.set_primary'->>'risk') <> 'write' then
    raise exception 'P20_19_policy_set_primary_failed:%', v_pols->'catalog.media.set_primary';
  end if;
  if (v_pols->'catalog.media.list'->>'risk') <> 'read' then
    raise exception 'P20_19_policy_media_list_failed:%', v_pols->'catalog.media.list';
  end if;
  if (v_pols->'inventory.unit_media.add'->>'permission') <> 'inventory.manage' then
    raise exception 'P20_19_policy_unit_media_add_failed:%', v_pols->'inventory.unit_media.add';
  end if;
  if (v_pols->'inventory.unit_media.list'->>'risk') <> 'read' then
    raise exception 'P20_19_policy_unit_media_list_failed:%', v_pols->'inventory.unit_media.list';
  end if;

  select pg_get_functiondef(p.oid)
    into v_dispatch_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'erp_agent_dispatch'
    and oidvectortypes(p.proargtypes) = 'uuid, text, jsonb, uuid'
  limit 1;

  if v_dispatch_def not ilike '%catalog.media.add%'
     or v_dispatch_def not ilike '%catalog.media.set_primary%'
     or v_dispatch_def not ilike '%catalog.media.remove%'
     or v_dispatch_def not ilike '%catalog.media.list%'
     or v_dispatch_def not ilike '%inventory.unit_media.add%'
     or v_dispatch_def not ilike '%inventory.unit_media.list%'
     or v_dispatch_def not ilike '%ready_for_media_finalization%' then
    raise exception 'P20_19_dispatch_verification_failed';
  end if;
end;
$verify$;
