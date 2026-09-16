-- P20.20B · Extiende `inventory.find` (SIN cambiar su nombre ni crear una
-- segunda acción) con filtro de `status` y `limit`, y conteo EXACTO sobre
-- TODOS los matches — independiente del `limit` — para que "qué unidades
-- del <producto> están disponibles" y "cuántos tenemos del 1" puedan
-- responder con una cifra real en vez de `items.length` (que con >12
-- unidades mentiría).
--
-- ── AUDITORÍA PREVIA (contra la definición VIVA, no solo migraciones) ────
-- Mismo mandato de P20.18/P20.19/P20.20A: se lee `pg_get_functiondef` justo
-- antes de parchear y se verifica la ocurrencia EXACTA del ancla.
--   - `erp_agent_dispatch(uuid,text,jsonb,uuid)` — el ancla es la rama
--     `when 'inventory.find' then ... end` completa, tal como quedó en
--     20260829190000_erp_fase3c_inventory_reception_serials.sql (la última
--     migración que la tocó). `v_status`/`v_limit` YA existen en el
--     DECLARE del dispatcher (reutilizados por `inventory.list_products`,
--     `sales.list`, `customers.list`) — CERO variables nuevas.
--   - `erp_agent_action_policy(text)` — `inventory.find` sigue mapeando a
--     `permission:'inventory.read', risk:'read'` — esta migración NO la
--     toca (se re-verifica al final, sin volver a escribirla).
--
-- ── COMPATIBILIDAD HACIA ATRÁS ────────────────────────────────────────────
-- `{query:"STU-000031"}` (sin `status`/`limit`) sigue funcionando IDÉNTICO:
-- mismos campos por unidad, mismo `order by u.created_at desc`, mismo tope
-- por defecto (12) cuando no se manda `limit`.
--
-- ── FORMATO DE RESPUESTA (aditivo) ────────────────────────────────────────
--   items         → hasta `limit` (12 por defecto, máx. 50), igual que antes
--                    más los dos campos nuevos opcionales de filtro.
--   totalMatches  → conteo EXACTO de TODOS los matches (con `status` si se
--                    pidió), calculado ANTES del `limit` — nunca
--                    `items.length`.
--   counts        → desglose por estado de TODOS los matches del `query`
--                    (sin aplicar `status` — así "cuántos tenemos del 1"
--                    puede mostrar el desglose completo en una sola
--                    llamada, y un segundo turno con `status:'available'`
--                    responde el total exacto de esa rama vía
--                    `totalMatches`).
--
-- ── SOLO LECTURA, MISMO PERMISO ───────────────────────────────────────────
-- `inventory.find` sigue siendo `inventory.read`/`risk:read` — esta
-- migración no crea, modifica ni revoca ningún GRANT/REVOKE, no toca
-- ninguna rama de ESCRITURA del dispatcher, y no amplía ningún ACL.

do $patch_dispatch_inventory_find$
declare
  v_oid oid;
  v_def text;

  v_needle text :=
$needle$    when 'inventory.find' then
      v_q:=lower(btrim(coalesce(v_args->>'query','')));
      if length(v_q)<2 then raise exception 'erp_agent_query_too_short'; end if;
      select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)) into v_result
      from (
        select u.id,u.unit_code as "unitCode",u.serial_number as "serialNumber",u.status,
               p.title as "productTitle",p.brand,p.model,p.price
        from public.product_units u join public.products p on p.id=u.product_id
        where lower(u.unit_code) like '%'||v_q||'%'
           or lower(coalesce(u.serial_number,'')) like '%'||v_q||'%'
           or lower(coalesce(p.title,'')) like '%'||v_q||'%'
           or lower(coalesce(p.brand,'')) like '%'||v_q||'%'
           or lower(coalesce(p.model,'')) like '%'||v_q||'%'
        order by u.created_at desc limit 12
      ) x;$needle$;

  v_replacement text :=
$replacement$    when 'inventory.find' then
      v_q:=lower(btrim(coalesce(v_args->>'query','')));
      if length(v_q)<2 then raise exception 'erp_agent_query_too_short'; end if;
      v_status:=nullif(lower(btrim(coalesce(v_args->>'status',''))),'');
      if v_status is not null and v_status not in ('received','inspection','available','reserved','sold','warranty','repair','returned','retired') then
        raise exception 'invalid_status_filter:%',v_status;
      end if;
      v_limit:=least(greatest(coalesce(nullif(v_args->>'limit','')::integer,12),1),50);
      select jsonb_build_object(
        'items',coalesce((
          select jsonb_agg(to_jsonb(x)) from (
            select u.id,u.unit_code as "unitCode",u.serial_number as "serialNumber",u.status,
                   p.title as "productTitle",p.brand,p.model,p.price
            from public.product_units u join public.products p on p.id=u.product_id
            where (lower(u.unit_code) like '%'||v_q||'%'
                   or lower(coalesce(u.serial_number,'')) like '%'||v_q||'%'
                   or lower(coalesce(p.title,'')) like '%'||v_q||'%'
                   or lower(coalesce(p.brand,'')) like '%'||v_q||'%'
                   or lower(coalesce(p.model,'')) like '%'||v_q||'%')
              and (v_status is null or u.status=v_status)
            order by u.created_at desc
            limit v_limit
          ) x
        ),'[]'::jsonb),
        'totalMatches',(
          select count(*)
          from public.product_units u join public.products p on p.id=u.product_id
          where (lower(u.unit_code) like '%'||v_q||'%'
                 or lower(coalesce(u.serial_number,'')) like '%'||v_q||'%'
                 or lower(coalesce(p.title,'')) like '%'||v_q||'%'
                 or lower(coalesce(p.brand,'')) like '%'||v_q||'%'
                 or lower(coalesce(p.model,'')) like '%'||v_q||'%')
            and (v_status is null or u.status=v_status)
        ),
        'counts',(
          select jsonb_build_object(
            'received',count(*) filter(where u.status='received'),
            'inspection',count(*) filter(where u.status='inspection'),
            'available',count(*) filter(where u.status='available'),
            'reserved',count(*) filter(where u.status='reserved'),
            'sold',count(*) filter(where u.status='sold'),
            'warranty',count(*) filter(where u.status='warranty'),
            'repair',count(*) filter(where u.status='repair'),
            'returned',count(*) filter(where u.status='returned'),
            'retired',count(*) filter(where u.status='retired')
          )
          from public.product_units u join public.products p on p.id=u.product_id
          where lower(u.unit_code) like '%'||v_q||'%'
             or lower(coalesce(u.serial_number,'')) like '%'||v_q||'%'
             or lower(coalesce(p.title,'')) like '%'||v_q||'%'
             or lower(coalesce(p.brand,'')) like '%'||v_q||'%'
             or lower(coalesce(p.model,'')) like '%'||v_q||'%'
        )
      ) into v_result;$replacement$;

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
    raise exception 'P20_20B_dispatch_not_found';
  end if;

  v_def := pg_get_functiondef(v_oid);

  v_ocurrencias := (length(v_def) - length(replace(v_def, v_needle, ''))) / greatest(length(v_needle), 1);
  if v_ocurrencias = 0 then
    raise exception 'P20_20B_dispatch_patch_anchor_not_found';
  end if;
  if v_ocurrencias > 1 then
    raise exception 'P20_20B_dispatch_patch_anchor_not_unique:%', v_ocurrencias;
  end if;

  execute replace(v_def, v_needle, v_replacement);
end;
$patch_dispatch_inventory_find$;

-- ── VERIFICACIÓN (§H del encargo) ─────────────────────────────────────────
--   - policy: inventory.find sigue inventory.read/read (sin re-escribirla).
--   - dispatcher: contiene la lectura de status/limit y las ramas de
--     ESCRITURA (inventory.transition_units, sale.create_by_stu,
--     customer.create) siguen intactas — esta migración solo tocó UNA rama
--     de lectura.
--   - status inválido falla con 'invalid_status_filter'.
--   - query histórica SIN status/limit sigue funcionando (compatibilidad).
do $verify$
declare
  v_pol jsonb;
  v_dispatch_def text;
  v_test_legacy jsonb;
  v_fallo_status boolean := false;
begin
  v_pol := public.erp_agent_action_policy('inventory.find');
  if (v_pol->>'permission') <> 'inventory.read' or (v_pol->>'risk') <> 'read' then
    raise exception 'P20_20B_policy_inventory_find_changed:%', v_pol;
  end if;

  select pg_get_functiondef(p.oid)
    into v_dispatch_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'erp_agent_dispatch'
    and oidvectortypes(p.proargtypes) = 'uuid, text, jsonb, uuid'
  limit 1;

  if v_dispatch_def not ilike '%totalMatches%'
     or v_dispatch_def not ilike '%invalid_status_filter%'
     or v_dispatch_def not ilike '%''counts''%' then
    raise exception 'P20_20B_dispatch_verification_failed_new_fields';
  end if;

  -- Nunca se tocaron las ramas de ESCRITURA: siguen presentes, verbatim.
  if v_dispatch_def not ilike '%inventory.transition_units%'
     or v_dispatch_def not ilike '%sale.create_by_stu%'
     or v_dispatch_def not ilike '%customer.create%' then
    raise exception 'P20_20B_dispatch_write_branches_missing_unexpected';
  end if;

  -- Compatibilidad: un query histórico SIN status/limit sigue funcionando
  -- (nunca falla, items:[] y totalMatches:0 si no matchea nada).
  v_test_legacy := public.erp_agent_dispatch(
    gen_random_uuid(), 'inventory.find',
    jsonb_build_object('query','zzz_p20_20b_no_existe_nunca'), gen_random_uuid()
  );
  if jsonb_typeof(v_test_legacy->'items') <> 'array' then
    raise exception 'P20_20B_verify_legacy_call_failed:%', v_test_legacy;
  end if;
  if (v_test_legacy->>'totalMatches')::int <> 0 then
    raise exception 'P20_20B_verify_legacy_totalMatches_failed:%', v_test_legacy;
  end if;

  -- status inválido debe fallar con el mensaje esperado.
  begin
    perform public.erp_agent_dispatch(
      gen_random_uuid(), 'inventory.find',
      jsonb_build_object('query','zzz','status','no_es_un_estado_real'), gen_random_uuid()
    );
  exception when others then
    if sqlerrm like '%invalid_status_filter%' then
      v_fallo_status := true;
    else
      raise exception 'P20_20B_verify_invalid_status_wrong_error:%', sqlerrm;
    end if;
  end;
  if not v_fallo_status then
    raise exception 'P20_20B_verify_invalid_status_did_not_fail';
  end if;
end;
$verify$;
