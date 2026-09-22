-- ============================================================================
-- P20.26 — la descripción comercial sube de 2000 a 8000 caracteres
-- ============================================================================
--
-- POR QUÉ
-- El administrador escribe la ficha desde WhatsApp y necesita sitio real para
-- decir para qué sirve el equipo y para qué NO — esa descripción es la fuente
-- que el agente usa para responder "¿me sirve para edición?" sin inventar. Con
-- 2000 caracteres no cabe una ficha con bullets, y el límite se alcanzaba en
-- cuanto la descripción tenía cuatro líneas.
--
-- QUÉ NO CAMBIA
--   · `public.products.descripcion` sigue siendo `text`: la base NUNCA impuso
--     un límite, así que no hay cambio de tipo ni de columna. Lo único que se
--     toca es la VALIDACIÓN de las dos funciones que escriben ese campo.
--   · Ningún otro campo. `condition` sigue en 200, los tipos y las políticas
--     de riesgo quedan exactamente igual.
--   · Superar el nuevo tope sigue siendo un error explícito
--     (`catalog_description_too_long` / `catalog_product_update_invalid_description`),
--     nunca un recorte silencioso: una ficha a medias publicada sin avisar es
--     peor que un rechazo.
--
-- DÓNDE SE VALIDA AHORA (todas coherentes en 8000)
--   · agente: src/catalogo/draft-modelo.js  → MAX_DESCRIPCION
--   · agente: src/catalogo/draft-parser.js  → errorDescripcionLarga()
--   · agente: src/erp/acciones.js           → Zod de publish_draft y product.update
--   · SQL   : las dos funciones que parchea esta migración
--
-- MÉTODO
-- Mismo patrón que el resto de parches a estas funciones: anchor EXACTO,
-- replace, recuento de ocurrencias (aborta si no es exactamente 1) y bloque
-- $verify$ al final. No se reescribe la función entera — se sustituye solo la
-- línea del límite, para no arrastrar cambios que nadie pidió.
-- ============================================================================

-- ── 1. catalog.product.update (dentro de erp_agent_dispatch) ────────────────
do $$
declare
  v_def   text;
  v_nuevo text;
  v_ancla text := '           or char_length(v_args->>''description'') > 2000 then';
  v_rep   text := '           or char_length(v_args->>''description'') > 8000 then';
  v_ocurrencias int;
begin
  select pg_get_functiondef(p.oid)
    into v_def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'erp_agent_dispatch';

  if v_def is null then
    raise exception 'no existe public.erp_agent_dispatch: nada que parchear';
  end if;

  v_ocurrencias := (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla);

  if v_ocurrencias = 0 then
    -- Ya aplicada (o el límite se cambió por otra vía): no es un error.
    if position('char_length(v_args->>''description'') > 8000' in v_def) > 0 then
      raise notice 'erp_agent_dispatch ya valida description a 8000: nada que hacer';
      return;
    end if;
    raise exception 'anchor de description no encontrado en erp_agent_dispatch';
  end if;

  if v_ocurrencias <> 1 then
    raise exception 'anchor de description aparece % veces (se esperaba 1)', v_ocurrencias;
  end if;

  v_nuevo := replace(v_def, v_ancla, v_rep);
  execute v_nuevo;
  raise notice 'erp_agent_dispatch: description 2000 -> 8000';
end
$$;

-- ── 2. erp_publish_catalog_draft (función independiente) ────────────────────
do $$
declare
  v_def   text;
  v_nuevo text;
  v_ancla text := 'if length(coalesce(v_description, '''')) > 2000 then';
  v_rep   text := 'if length(coalesce(v_description, '''')) > 8000 then';
  v_ocurrencias int;
begin
  select pg_get_functiondef(p.oid)
    into v_def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'erp_publish_catalog_draft';

  if v_def is null then
    raise exception 'no existe public.erp_publish_catalog_draft: nada que parchear';
  end if;

  v_ocurrencias := (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla);

  if v_ocurrencias = 0 then
    if position('length(coalesce(v_description, '''')) > 8000' in v_def) > 0 then
      raise notice 'erp_publish_catalog_draft ya valida description a 8000: nada que hacer';
      return;
    end if;
    raise exception 'anchor de description no encontrado en erp_publish_catalog_draft';
  end if;

  if v_ocurrencias <> 1 then
    raise exception 'anchor de description aparece % veces (se esperaba 1)', v_ocurrencias;
  end if;

  v_nuevo := replace(v_def, v_ancla, v_rep);
  execute v_nuevo;
  raise notice 'erp_publish_catalog_draft: description 2000 -> 8000';
end
$$;

-- ── 3. Verificación estructural ─────────────────────────────────────────────
do $verify$
declare
  v_dispatch text;
  v_publish  text;
begin
  select pg_get_functiondef(p.oid) into v_dispatch
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'erp_agent_dispatch';

  select pg_get_functiondef(p.oid) into v_publish
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'erp_publish_catalog_draft';

  -- El nuevo límite está en las dos.
  if position('char_length(v_args->>''description'') > 8000' in v_dispatch) = 0 then
    raise exception 'verify: erp_agent_dispatch no quedó en 8000';
  end if;
  if position('length(coalesce(v_description, '''')) > 8000' in v_publish) = 0 then
    raise exception 'verify: erp_publish_catalog_draft no quedó en 8000';
  end if;

  -- El viejo ya no está.
  if position('char_length(v_args->>''description'') > 2000' in v_dispatch) > 0 then
    raise exception 'verify: erp_agent_dispatch conserva el límite de 2000';
  end if;
  if position('length(coalesce(v_description, '''')) > 2000' in v_publish) > 0 then
    raise exception 'verify: erp_publish_catalog_draft conserva el límite de 2000';
  end if;

  -- Y NADA MÁS cambió: condition sigue en 200 en ambas.
  if position('char_length(v_args->>''condition'') > 200' in v_dispatch) = 0 then
    raise exception 'verify: se alteró el límite de condition en erp_agent_dispatch';
  end if;
  if position('length(coalesce(v_condition, '''')) > 200' in v_publish) = 0 then
    raise exception 'verify: se alteró el límite de condition en erp_publish_catalog_draft';
  end if;

  -- La columna sigue siendo `text`: esta migración no toca el esquema.
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'products'
       and column_name = 'descripcion' and data_type = 'text'
  ) then
    raise exception 'verify: products.descripcion ya no es text';
  end if;

  raise notice 'verify OK: descripción a 8000 en ambas funciones, resto intacto';
end
$verify$;
