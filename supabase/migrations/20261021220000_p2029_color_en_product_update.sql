-- ============================================================================
-- P20.29 — `color` entra en catalog.product.update
-- ============================================================================
--
-- POR QUÉ
-- P20.29 añadió `products.color` (el color declarado del modelo) y
-- `products.colores_disponibles` (el derivado de las unidades vendibles). El
-- administrador ya puede verlo en la web, el catálogo y el bot, pero todavía
-- no puede EDITARLO desde WhatsApp: `erp_agent_dispatch` rechaza cualquier
-- clave que no esté en su lista blanca (`catalog_product_update_unknown_fields`).
-- Esta migración abre esa puerta, y solo esa.
--
-- QUÉ NO CAMBIA
--   · `colores_disponibles` NO se puede escribir por aquí. Es un derivado de
--     las unidades y lo mantiene su trigger; dejarlo editable haría que el
--     catálogo ofreciera colores que no existen en bodega. Si llega esa clave,
--     sigue siendo `catalog_product_update_unknown_fields`.
--   · Ni precio, ni cantidad, ni stock, ni título, ni ninguna otra columna.
--     Editar solo el color escribe solo `products.color`.
--   · El resto de acciones, los niveles de riesgo y el flujo de confirmación
--     quedan intactos.
--
-- EFECTO EN CADENA (buscado)
-- Al escribir `products.color`, el trigger `products_sync_colors` de P20.29
-- recalcula `colores_disponibles`: si el modelo pasa a "Gris", las unidades
-- que no tengan `spec_overrides.color` propio pasan a ofrecerse como grises.
-- Las que SÍ lo tengan conservan el suyo — el color por unidad manda.
--
-- BORRAR EL COLOR
-- `{"color": null}` lo deja sin especificar (la web dirá "Sin especificar").
-- Es deliberado: un color mal puesto tiene que poder quitarse, y la columna
-- tiene `products_color_not_blank`, así que la cadena vacía se guarda como
-- NULL en vez de violar la restricción.
--
-- MÉTODO
-- El mismo que el resto de parches a esta función (ver
-- 20260922000000_erp_fase3m_descripcion_8000.sql): anclas EXACTAS sobre
-- `pg_get_functiondef`, recuento de ocurrencias, aborto si no es exactamente
-- 1, idempotencia si ya estaba aplicada, y bloque de verificación al final.
-- La función no se reescribe entera: así no se arrastra ningún cambio que
-- nadie pidió.
-- ============================================================================

do $migracion$
declare
  v_oid oid;
  v_def text;
  v_parches text[][] := array[
    -- 1. `color` cuenta como campo editable válido.
    array[
      '      if not (v_args ? ''title'') and not (v_args ? ''cpu'')' || chr(10) ||
      '         and not (v_args ? ''condition'') and not (v_args ? ''description'') then',
      '      if not (v_args ? ''title'') and not (v_args ? ''cpu'')' || chr(10) ||
      '         and not (v_args ? ''condition'') and not (v_args ? ''description'')' || chr(10) ||
      '         and not (v_args ? ''color'') then'
    ],
    -- 2. `color` entra en la lista blanca de claves. `colores_disponibles`
    --    NO: es derivado y sigue rechazándose.
    array[
      '        where k.key not in (''productId'', ''title'', ''cpu'', ''condition'', ''description'')',
      '        where k.key not in (''productId'', ''title'', ''cpu'', ''condition'', ''description'', ''color'')'
    ],
    -- 3. Validación de `color`, justo detrás de la de `description`.
    array[
      '          raise exception ''catalog_product_update_invalid_description'';' || chr(10) ||
      '        end if;' || chr(10) ||
      '      end if;',
      '          raise exception ''catalog_product_update_invalid_description'';' || chr(10) ||
      '        end if;' || chr(10) ||
      '      end if;' || chr(10) ||
      chr(10) ||
      '      -- P20.29 — `color` del MODELO. Texto literal del administrador: se' || chr(10) ||
      '      -- valida pero se escribe tal como llegó. `null` lo deja sin' || chr(10) ||
      '      -- especificar (la columna tiene products_color_not_blank, así que' || chr(10) ||
      '      -- nunca se guarda cadena vacía).' || chr(10) ||
      '      if v_args ? ''color'' then' || chr(10) ||
      '        if jsonb_typeof(v_args->''color'') not in (''string'', ''null'') then' || chr(10) ||
      '          raise exception ''catalog_product_update_invalid_color_type'';' || chr(10) ||
      '        end if;' || chr(10) ||
      chr(10) ||
      '        if jsonb_typeof(v_args->''color'') = ''string''' || chr(10) ||
      '           and nullif(btrim(v_args->>''color''), '''') is not null' || chr(10) ||
      '           and char_length(btrim(v_args->>''color'')) > 60 then' || chr(10) ||
      '          raise exception ''catalog_product_update_invalid_color'';' || chr(10) ||
      '        end if;' || chr(10) ||
      '      end if;'
    ],
    -- 4. Snapshot BEFORE.
    array[
      '          ''description'', p.descripcion' || chr(10) ||
      '        )',
      '          ''description'', p.descripcion,' || chr(10) ||
      '          ''color'', p.color' || chr(10) ||
      '        )'
    ],
    -- 5. El UPDATE. Solo la columna `color`; nada más se toca.
    array[
      '        descripcion = case' || chr(10) ||
      '          when v_args ? ''description'' then v_args->>''description''' || chr(10) ||
      '          else descripcion' || chr(10) ||
      '        end',
      '        descripcion = case' || chr(10) ||
      '          when v_args ? ''description'' then v_args->>''description''' || chr(10) ||
      '          else descripcion' || chr(10) ||
      '        end,' || chr(10) ||
      '        color = case' || chr(10) ||
      '          when v_args ? ''color'' then nullif(btrim(coalesce(v_args->>''color'', '''')), '''')' || chr(10) ||
      '          else color' || chr(10) ||
      '        end'
    ],
    -- 6. Snapshot AFTER.
    array[
      '            ''description'', descripcion' || chr(10) ||
      '          ),',
      '            ''description'', descripcion,' || chr(10) ||
      '            ''color'', color' || chr(10) ||
      '          ),'
    ],
    -- 7. updatedFields.
    array[
      '                  case when v_args ? ''description'' then ''description'' end' || chr(10) ||
      '                ],',
      '                  case when v_args ? ''description'' then ''description'' end,' || chr(10) ||
      '                  case when v_args ? ''color'' then ''color'' end' || chr(10) ||
      '                ],'
    ]
  ];
  v_ancla text;
  v_rep text;
  v_ocurrencias integer;
  i integer;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'erp_agent_dispatch'
    and oidvectortypes(p.proargtypes) = 'uuid, text, jsonb, uuid'
  limit 1;

  if v_oid is null then
    raise exception 'P20_29_dispatch_not_found: no existe public.erp_agent_dispatch(uuid,text,jsonb,uuid)';
  end if;

  v_def := pg_get_functiondef(v_oid);

  -- Idempotencia: si `color` ya está en la lista blanca, no hay nada que hacer.
  if position('''condition'', ''description'', ''color''' in v_def) > 0 then
    raise notice 'P20.29: catalog.product.update ya acepta color; nada que parchear';
    return;
  end if;

  for i in 1 .. array_length(v_parches, 1) loop
    v_ancla := v_parches[i][1];
    v_rep   := v_parches[i][2];

    v_ocurrencias :=
      (length(v_def) - length(replace(v_def, v_ancla, '')))
      / greatest(length(v_ancla), 1);

    if v_ocurrencias <> 1 then
      raise exception
        'P20_29_ancla_%_con_%_ocurrencias: se esperaba exactamente 1. La función cambió; revisar a mano antes de aplicar.',
        i, v_ocurrencias;
    end if;

    v_def := replace(v_def, v_ancla, v_rep);
  end loop;

  execute v_def;
  raise notice 'P20.29: catalog.product.update ahora acepta color';
end
$migracion$;

-- ── Verificación ────────────────────────────────────────────────────────────
do $verify$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'erp_agent_dispatch'
    and oidvectortypes(p.proargtypes) = 'uuid, text, jsonb, uuid'
  limit 1;

  if v_def is null then
    raise exception 'P20_29_verify: la función desapareció';
  end if;

  -- `color` editable.
  if position('''condition'', ''description'', ''color''' in v_def) = 0 then
    raise exception 'P20_29_verify: color no quedó en la lista blanca';
  end if;
  if position('catalog_product_update_invalid_color_type' in v_def) = 0 then
    raise exception 'P20_29_verify: falta la validación de tipo de color';
  end if;
  if position('color = case' in v_def) = 0 then
    raise exception 'P20_29_verify: el UPDATE no escribe color';
  end if;

  -- `colores_disponibles` NO editable: no debe aparecer en ninguna parte de
  -- esta acción. Es el invariante que protege al catálogo de ofrecer colores
  -- que no hay en bodega.
  if position('colores_disponibles' in v_def) > 0 then
    raise exception 'P20_29_verify: colores_disponibles NO puede ser escribible desde el agente';
  end if;

  -- Lo preexistente sigue en pie.
  if position('catalog_product_update_no_fields' in v_def) = 0
     or position('catalog_product_update_unknown_fields' in v_def) = 0
     or position('catalog_product_update_invalid_title' in v_def) = 0
     or position('catalog_product_update_invalid_cpu' in v_def) = 0
     or position('catalog_product_update_invalid_condition' in v_def) = 0
     or position('catalog_product_update_invalid_description' in v_def) = 0 then
    raise exception 'P20_29_verify: se perdió una validación preexistente';
  end if;

  raise notice 'P20.29 verify OK: color editable, colores_disponibles protegido, resto intacto';
end
$verify$;
