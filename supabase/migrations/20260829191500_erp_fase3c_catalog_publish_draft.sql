-- ============================================================================
-- P20.17C — Publicación transaccional de AdminProductDraft
-- ============================================================================
-- Objetivos:
--   1. Crear un producto nuevo o recibir unidades de uno existente.
--   2. Producto nuevo: visible_web=false hasta finalizar media.
--   3. Producto nuevo: erp_stock_enabled=true desde el inicio.
--   4. Recibir unidades mediante la RPC P20.17B ya validada.
--   5. Idempotencia adicional por draftId.
--   6. Ninguna ruta local de archivos cruza al servidor.
--   7. Condiciones pendientes/media/garantía quedan preservadas en snapshot.
-- ============================================================================


-- --------------------------------------------------------------------------
-- 1. Registro interno de drafts publicados
-- --------------------------------------------------------------------------

create table if not exists public.erp_catalog_draft_publications (
  draft_id          text        primary key,
  request_id        uuid        not null unique,
  actor_profile_id  uuid        not null,
  product_id        uuid,
  draft_snapshot    jsonb       not null,
  result            jsonb,
  created_at        timestamptz not null default now(),
  completed_at      timestamptz
);

alter table public.erp_catalog_draft_publications
  enable row level security;

revoke all
on table public.erp_catalog_draft_publications
from public, anon, authenticated, service_role;

comment on table public.erp_catalog_draft_publications is
  'P20.17C: idempotencia y snapshot de publicación de drafts administrativos. Tabla interna; sin acceso directo desde cliente/agente.';


-- --------------------------------------------------------------------------
-- 2. Operación interna transaccional
-- --------------------------------------------------------------------------

create or replace function public.erp_publish_catalog_draft(
  p_actor_profile_id uuid,
  p_request_id uuid,
  p_args jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_draft_id text;

  v_existing_product_id uuid;
  v_existing_product_text text;

  v_brand text;
  v_model text;
  v_title text;
  v_cpu text;
  v_screen text;
  v_gpu text;
  v_storage_type text;
  v_storage_label text;

  v_ram integer;
  v_storage_gb integer;
  v_price_cop bigint;
  v_quantity integer;
  v_warranty_months integer;

  v_product_id uuid;
  v_product public.products%rowtype;
  v_created_product boolean := false;

  v_serials text[];
  v_serial_count integer := 0;

  v_units jsonb := '[]'::jsonb;
  v_result jsonb;
  v_existing_result jsonb;

  v_media_count integer := 0;
  v_pending_conditions_count integer := 0;

  v_inserted integer := 0;
begin
  -- Defensa adicional: la acción solo puede ejecutarse para un perfil admin.
  if p_actor_profile_id is null or not exists (
    select 1
    from public.profiles p
    where p.id = p_actor_profile_id
      and p.is_admin = true
      and coalesce(p.active, true) = true
  ) then
    raise exception 'erp_admin_required'
      using errcode = '42501';
  end if;

  if p_request_id is null then
    raise exception 'request_id_required';
  end if;

  if p_args is null or jsonb_typeof(p_args) <> 'object' then
    raise exception 'catalog_draft_arguments_required';
  end if;


  -- ------------------------------------------------------------------------
  -- Draft / idempotencia
  -- ------------------------------------------------------------------------

  v_draft_id := nullif(btrim(coalesce(p_args->>'draftId', '')), '');

  if v_draft_id is null
     or length(v_draft_id) < 6
     or length(v_draft_id) > 64 then
    raise exception 'catalog_draft_id_invalid';
  end if;

  insert into public.erp_catalog_draft_publications (
    draft_id,
    request_id,
    actor_profile_id,
    draft_snapshot
  )
  values (
    v_draft_id,
    p_request_id,
    p_actor_profile_id,
    p_args
  )
  on conflict (draft_id) do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    select d.result
      into v_existing_result
    from public.erp_catalog_draft_publications d
    where d.draft_id = v_draft_id;

    if v_existing_result is null then
      raise exception 'catalog_draft_publication_in_progress';
    end if;

    return v_existing_result ||
      jsonb_build_object('duplicate', true);
  end if;


  -- ------------------------------------------------------------------------
  -- Cantidad
  -- ------------------------------------------------------------------------

  begin
    v_quantity := (p_args->>'quantity')::integer;
  exception when others then
    raise exception 'catalog_quantity_invalid';
  end;

  if v_quantity is null or v_quantity < 1 or v_quantity > 100 then
    raise exception 'catalog_quantity_out_of_range';
  end if;


  -- ------------------------------------------------------------------------
  -- Seriales de fabricante
  -- ------------------------------------------------------------------------

  if p_args ? 'manufacturerSerials' then
    if jsonb_typeof(p_args->'manufacturerSerials') <> 'array' then
      raise exception 'catalog_manufacturer_serials_invalid';
    end if;

    select array_agg(btrim(x.value) order by x.ordinality)
      into v_serials
    from jsonb_array_elements_text(
      p_args->'manufacturerSerials'
    ) with ordinality as x(value, ordinality);

    v_serial_count := coalesce(array_length(v_serials, 1), 0);

    if v_serial_count > v_quantity then
      raise exception 'catalog_more_serials_than_units';
    end if;

    if exists (
      select 1
      from unnest(coalesce(v_serials, array[]::text[])) s
      where nullif(btrim(s), '') is null
         or length(btrim(s)) > 64
    ) then
      raise exception 'catalog_manufacturer_serial_invalid';
    end if;
  end if;


  -- ------------------------------------------------------------------------
  -- Metadatos que todavía NO se aplican automáticamente
  -- ------------------------------------------------------------------------

  if p_args ? 'mediaManifest' then
    if jsonb_typeof(p_args->'mediaManifest') <> 'array' then
      raise exception 'catalog_media_manifest_invalid';
    end if;
    v_media_count := jsonb_array_length(p_args->'mediaManifest');
    if v_media_count > 30 then
      raise exception 'catalog_media_manifest_too_large';
    end if;
  end if;

  if p_args ? 'pendingConditions' then
    if jsonb_typeof(p_args->'pendingConditions') <> 'array' then
      raise exception 'catalog_pending_conditions_invalid';
    end if;
    v_pending_conditions_count :=
      jsonb_array_length(p_args->'pendingConditions');
  end if;

  if nullif(p_args->>'warrantyMonths', '') is not null then
    begin
      v_warranty_months :=
        (p_args->>'warrantyMonths')::integer;
    exception when others then
      raise exception 'catalog_warranty_months_invalid';
    end;

    if v_warranty_months < 0 or v_warranty_months > 60 then
      raise exception 'catalog_warranty_months_out_of_range';
    end if;
  end if;


  -- ------------------------------------------------------------------------
  -- Producto existente vs producto nuevo
  -- ------------------------------------------------------------------------

  v_existing_product_text :=
    nullif(btrim(coalesce(p_args->>'existingProductId', '')), '');

  if v_existing_product_text is not null then
    begin
      v_existing_product_id := v_existing_product_text::uuid;
    exception when others then
      raise exception 'catalog_existing_product_id_invalid';
    end;

    select *
      into v_product
    from public.products
    where id = v_existing_product_id
    for update;

    if not found then
      raise exception 'product_not_found';
    end if;

    v_product_id := v_product.id;

    -- IMPORTANTE:
    -- un producto existente NO cambia automáticamente de modo stock ni se
    -- sobreescriben sus specs/precio. Aquí únicamente recibe nuevas unidades.
    v_created_product := false;

  else
    v_brand  := nullif(btrim(coalesce(p_args->>'brand', '')), '');
    v_model  := nullif(btrim(coalesce(p_args->>'model', '')), '');
    v_cpu    := nullif(btrim(coalesce(p_args->>'cpu', '')), '');
    v_screen := nullif(btrim(coalesce(p_args->>'screen', '')), '');
    v_gpu    := nullif(btrim(coalesce(p_args->>'gpu', '')), '');

    if v_brand is null and v_model is null then
      raise exception 'catalog_brand_or_model_required';
    end if;

    if length(coalesce(v_brand, '')) > 60
       or length(coalesce(v_model, '')) > 120
       or length(coalesce(v_cpu, '')) > 80
       or length(coalesce(v_screen, '')) > 40
       or length(coalesce(v_gpu, '')) > 60 then
      raise exception 'catalog_product_text_too_long';
    end if;

    begin
      v_ram := (p_args->>'ramGb')::integer;
    exception when others then
      raise exception 'catalog_ram_invalid';
    end;

    if v_ram is null or v_ram < 1 or v_ram > 256 then
      raise exception 'catalog_ram_out_of_range';
    end if;

    begin
      v_storage_gb := (p_args->>'storageGb')::integer;
    exception when others then
      raise exception 'catalog_storage_invalid';
    end;

    if v_storage_gb is null
       or v_storage_gb < 1
       or v_storage_gb > 100000 then
      raise exception 'catalog_storage_out_of_range';
    end if;

    v_storage_type :=
      nullif(lower(btrim(coalesce(p_args->>'storageType', ''))), '');

    if v_storage_type is not null
       and v_storage_type not in ('ssd', 'hdd') then
      raise exception 'catalog_storage_type_invalid';
    end if;

    begin
      v_price_cop := (p_args->>'priceCop')::bigint;
    exception when others then
      raise exception 'catalog_price_invalid';
    end;

    if v_price_cop is null
       or v_price_cop < 1
       or v_price_cop > 100000000 then
      raise exception 'catalog_price_out_of_range';
    end if;

    v_title :=
      btrim(concat_ws(' ', v_brand, v_model));

    if v_title = '' or length(v_title) > 200 then
      raise exception 'catalog_title_invalid';
    end if;

    v_storage_label :=
      v_storage_gb::text || ' GB' ||
      case
        when v_storage_type is not null
          then ' ' || upper(v_storage_type)
        else ''
      end;

    insert into public.products (
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
    )
    returning *
      into v_product;

    v_product_id := v_product.id;
    v_created_product := true;
  end if;


  -- ------------------------------------------------------------------------
  -- El actor de WhatsApp pasa a las RPC ERP existentes.
  -- No se entrega service_role al agente.
  -- ------------------------------------------------------------------------

  perform set_config(
    'request.jwt.claim.sub',
    p_actor_profile_id::text,
    true
  );


  -- ------------------------------------------------------------------------
  -- Recepción física P20.17B
  -- ------------------------------------------------------------------------

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'unitId', x.unit_id,
        'unitCode', x.unit_code
      )
      order by x.unit_code
    ),
    '[]'::jsonb
  )
    into v_units
  from public.erp_receive_units_batch(
    v_product_id,
    v_quantity,
    v_serials,
    '{}'::jsonb,
    'Recepción desde AdminProductDraft ' || v_draft_id
  ) x;


  -- ------------------------------------------------------------------------
  -- Resultado
  -- ------------------------------------------------------------------------

  select *
    into v_product
  from public.products
  where id = v_product_id;

  v_result := jsonb_build_object(
    'draftId', v_draft_id,
    'requestId', p_request_id,
    'productId', v_product_id,
    'productTitle', v_product.title,
    'createdProduct', v_created_product,
    'quantity', v_quantity,
    'units', v_units,
    'erpStockEnabled', coalesce(v_product.erp_stock_enabled, false),
    'webStock', coalesce(v_product.stock, 0),
    'visibleWeb', coalesce(v_product.visible_web, false),
    'mediaPendingCount', v_media_count,
    'pendingConditionsCount', v_pending_conditions_count,
    'warrantyMonths', v_warranty_months,
    'duplicate', false
  );


  -- ------------------------------------------------------------------------
  -- Auditoría de alto nivel
  -- ------------------------------------------------------------------------

  insert into public.audit_events (
    actor_type,
    actor_ref,
    channel,
    operation,
    entity_type,
    entity_id,
    before_snapshot,
    after_snapshot,
    metadata
  )
  values (
    'web_admin',
    p_actor_profile_id::text,
    'whatsapp',
    'catalog.publish_draft',
    'product',
    v_product_id,
    null,
    jsonb_build_object(
      'productId', v_product_id,
      'title', v_product.title,
      'createdProduct', v_created_product,
      'quantity', v_quantity,
      'erpStockEnabled', coalesce(v_product.erp_stock_enabled, false),
      'visibleWeb', coalesce(v_product.visible_web, false)
    ),
    jsonb_build_object(
      'source', 'whatsapp_admin',
      'draftId', v_draft_id,
      'requestId', p_request_id,
      'mediaPendingCount', v_media_count,
      'pendingConditionsCount', v_pending_conditions_count,
      'warrantyMonths', v_warranty_months
    )
  );


  update public.erp_catalog_draft_publications
  set product_id   = v_product_id,
      result       = v_result,
      completed_at = now()
  where draft_id = v_draft_id;

  return v_result;
end;
$$;

revoke all
on function public.erp_publish_catalog_draft(uuid, uuid, jsonb)
from public, anon, authenticated, service_role;

grant execute
on function public.erp_publish_catalog_draft(uuid, uuid, jsonb)
to postgres;

comment on function public.erp_publish_catalog_draft(uuid, uuid, jsonb) is
  'P20.17C: publica transaccionalmente un AdminProductDraft confirmado. Crea producto oculto cuando corresponde y recibe sus unidades mediante P20.17B.';


-- --------------------------------------------------------------------------
-- 3. Extender política de acciones SIN copiar/reinventar casos anteriores
-- --------------------------------------------------------------------------

do $patch_policy$
declare
  v_oid oid;
  v_def text;
  v_needle text :=
    $$    when 'inventory.resolve_unit'                   then jsonb_build_object('permission','inventory.read','risk','read')$$;
  v_replacement text :=
    $$    when 'inventory.resolve_unit'                   then jsonb_build_object('permission','inventory.read','risk','read')
    when 'catalog.publish_draft'                          then jsonb_build_object('permission','inventory.manage','risk','sensitive')$$;
begin
  select p.oid
    into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'erp_agent_action_policy'
  limit 1;

  if v_oid is null then
    raise exception 'P20_17C_action_policy_not_found';
  end if;

  v_def := pg_get_functiondef(v_oid);

  if position(v_needle in v_def) = 0 then
    raise exception 'P20_17C_action_policy_patch_anchor_not_found';
  end if;

  execute replace(v_def, v_needle, v_replacement);
end;
$patch_policy$;


-- --------------------------------------------------------------------------
-- 4. Extender dispatcher preservando todo P20.17B
--
-- Firma auditada:
-- erp_agent_dispatch(uuid,text,jsonb,uuid)
-- $1 = profile actor
-- $4 = request id
-- --------------------------------------------------------------------------

do $patch_dispatch$
declare
  v_oid oid;
  v_def text;

  v_needle text :=
$needle$    else
      raise exception 'erp_agent_unknown_action:%',v_action;$needle$;

  v_replacement text :=
$replacement$    when 'catalog.publish_draft' then
      v_result := public.erp_publish_catalog_draft($1, $4, v_args);

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
    raise exception 'P20_17C_dispatch_not_found';
  end if;

  v_def := pg_get_functiondef(v_oid);

  if position(v_needle in v_def) = 0 then
    raise exception 'P20_17C_dispatch_patch_anchor_not_found';
  end if;

  execute replace(v_def, v_needle, v_replacement);
end;
$patch_dispatch$;


-- --------------------------------------------------------------------------
-- 5. Guardas de instalación
-- --------------------------------------------------------------------------

do $verify$
declare
  v_policy jsonb;
  v_dispatch_def text;
begin
  select public.erp_agent_action_policy('catalog.publish_draft')
    into v_policy;

  if coalesce(v_policy->>'permission', '') <> 'inventory.manage'
     or coalesce(v_policy->>'risk', '') <> 'sensitive' then
    raise exception
      'P20_17C_action_policy_verification_failed:%',
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

  if v_dispatch_def not ilike '%catalog.publish_draft%'
     or v_dispatch_def not ilike '%erp_publish_catalog_draft%' then
    raise exception 'P20_17C_dispatch_verification_failed';
  end if;

  if has_function_privilege(
    'service_role',
    'public.erp_publish_catalog_draft(uuid,uuid,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'P20_17C_internal_publish_exposed_to_service_role';
  end if;
end;
$verify$;
