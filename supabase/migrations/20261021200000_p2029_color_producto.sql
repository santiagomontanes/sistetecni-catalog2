-- ============================================================================
-- P20.29 · COLOR DE CADA COMPUTADOR
-- ============================================================================
--
-- DÓNDE VIVE EL COLOR, Y POR QUÉ
--
-- El esquema real es `products` → `product_units`. NO hay tabla de variantes
-- ni de SKU, así que no existe una capa intermedia donde colgar el color.
--
--   · `products.color`  — el color del MODELO. Es lo que el administrador
--     declara al publicar y lo que se usa por defecto.
--   · `product_units.spec_overrides->>'color'` — el color de UNA unidad
--     concreta, cuando difiere del modelo. NO se crea columna nueva: ese jsonb
--     ya es el mecanismo de desviación por unidad y además se fotografía en
--     `sale_items.unit_spec_overrides_snapshot`, así que el color queda en el
--     histórico de cada venta sin trabajo extra.
--
-- LO QUE VE EL CLIENTE SON LAS UNIDADES DISPONIBLES, NO EL MODELO
--
-- Si la ficha dice "negro" pero la única unidad que queda es plateada, ofrecer
-- "negro" es vender algo que no existe. Por eso se mantiene además:
--
--   · `products.colores_disponibles text[]` — los colores DISTINTOS de las
--     unidades en estado `available`, resolviendo cada una como
--     `spec_overrides.color` si lo trae, y `products.color` si no.
--
-- Es un dato DERIVADO, igual que `products.stock`: lo mantiene un trigger
-- dentro de la misma transacción del cambio físico. Se denormaliza aquí a
-- propósito — el agente de WhatsApp lee con la clave ANÓNIMA y NO tiene (ni
-- debe tener) permiso sobre `product_units`; sin esta columna no podría saber
-- de qué color es lo que hay, o habría que darle un privilegio que no le
-- corresponde.
--
-- Esta migración es ADITIVA: no borra, no reescribe y no toca stock, precios
-- ni unidades. Los productos existentes quedan con `color = null`, que la
-- interfaz muestra como «Sin especificar». No se adivina ningún color.
-- ============================================================================

-- ============================================================================
-- 1. Columnas
-- ============================================================================

alter table public.products
  add column if not exists color text,
  add column if not exists colores_disponibles text[] not null default '{}'::text[];

comment on column public.products.color is
  'P20.29: color declarado del MODELO. null = sin especificar (nunca se infiere).';

comment on column public.products.colores_disponibles is
  'P20.29: DERIVADA. Colores distintos de las unidades status=available, '
  'resolviendo spec_overrides.color y, si falta, products.color. La mantiene '
  'erp_sync_product_colors(); no editar a mano.';

-- Texto con contenido o null: nunca cadena vacía ni solo espacios.
alter table public.products
  drop constraint if exists products_color_not_blank;
alter table public.products
  add constraint products_color_not_blank
  check (color is null or length(btrim(color)) > 0);

-- ============================================================================
-- 2. Color efectivo de una unidad
-- ============================================================================

create or replace function public.erp_unit_color(p_unit_id uuid)
returns text
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select nullif(btrim(coalesce(u.spec_overrides->>'color', p.color)), '')
  from public.product_units u
  join public.products p on p.id = u.product_id
  where u.id = p_unit_id;
$$;

revoke all on function public.erp_unit_color(uuid) from public;
grant execute on function public.erp_unit_color(uuid) to authenticated;

comment on function public.erp_unit_color(uuid) is
  'P20.29: color efectivo de una unidad = spec_overrides.color, o el del modelo.';

-- ============================================================================
-- 3. Recálculo de los colores disponibles
-- ============================================================================

create or replace function public.erp_sync_product_colors(p_product_id uuid)
returns text[]
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_colores text[];
begin
  -- ── Serialización ────────────────────────────────────────────────────
  --
  -- Se toma el bloqueo de la fila del producto ANTES de contar. Sin esto hay
  -- una carrera real, medida: si dos operaciones venden una unidad cada una a
  -- la vez, cada transacción cuenta con su propia foto —en la que la unidad
  -- de la otra sigue disponible— y la última en escribir deja un color que ya
  -- no existe. Con dos unidades, una negra y otra plateada, vendidas a la vez,
  -- el resultado observado era `{Negro}` con CERO unidades vendibles.
  --
  -- Con el bloqueo, la segunda transacción espera; y como en READ COMMITTED
  -- cada sentencia toma una foto nueva, al despertar ya ve lo que la primera
  -- confirmó y cuenta bien.
  perform 1 from public.products where id = p_product_id for update;

  -- Solo unidades vendibles. Una unidad vendida, en garantía o retirada no
  -- dice nada sobre lo que el cliente puede comprar hoy.
  select coalesce(array_agg(distinct c order by c), '{}'::text[])
    into v_colores
  from (
    select nullif(btrim(coalesce(u.spec_overrides->>'color', p.color)), '') as c
    from public.product_units u
    join public.products p on p.id = u.product_id
    where u.product_id = p_product_id
      and u.status = 'available'
  ) s
  where s.c is not null;

  update public.products
  set colores_disponibles = v_colores
  where id = p_product_id
    and colores_disponibles is distinct from v_colores;

  return v_colores;
end;
$$;

revoke all on function public.erp_sync_product_colors(uuid) from public;
grant execute on function public.erp_sync_product_colors(uuid) to authenticated;

comment on function public.erp_sync_product_colors(uuid) is
  'P20.29: recalcula products.colores_disponibles desde las unidades available.';

-- ============================================================================
-- 4. Sincronización automática
-- ============================================================================
--
-- Mismo criterio que `product_units_sync_web_stock` (Fase 1D): el dato
-- derivado se recalcula DENTRO de la transacción del cambio físico, para que
-- nunca exista un instante en que el stock y el color discrepen.

create or replace function public.erp_sync_colors_from_unit_change()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform public.erp_sync_product_colors(old.product_id);
    return old;
  end if;

  if tg_op = 'INSERT' then
    perform public.erp_sync_product_colors(new.product_id);
    return new;
  end if;

  if old.product_id is distinct from new.product_id then
    perform public.erp_sync_product_colors(old.product_id);
    perform public.erp_sync_product_colors(new.product_id);
  elsif old.status is distinct from new.status
     or old.spec_overrides is distinct from new.spec_overrides then
    perform public.erp_sync_product_colors(new.product_id);
  end if;

  return new;
end;
$$;

drop trigger if exists product_units_sync_colors on public.product_units;
create trigger product_units_sync_colors
  after insert or delete or update of status, product_id, spec_overrides
  on public.product_units
  for each row execute function public.erp_sync_colors_from_unit_change();

comment on function public.erp_sync_colors_from_unit_change() is
  'P20.29: mantiene colores_disponibles al ritmo de los cambios físicos.';

-- Cambiar el color del MODELO también cambia el de las unidades que no lo
-- sobrescriben, así que hay que recalcular.
create or replace function public.erp_sync_colors_from_product_change()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  -- Cambió el color del MODELO: las unidades que no lo sobrescriben lo heredan.
  if old.color is distinct from new.color then
    perform public.erp_sync_product_colors(new.id);
    return new;
  end if;

  -- Alguien escribió a mano en la columna DERIVADA. No se bloquea la
  -- escritura —eso rompería a cualquier proceso que haga `update products
  -- set ...` con la fila entera— pero se recalcula acto seguido, así que el
  -- valor inventado no sobrevive. Un color equivocado en la ficha es
  -- exactamente lo que esta columna existe para evitar.
  --
  -- No hay recursión infinita: el recálculo solo escribe si el valor cambia,
  -- de modo que la segunda pasada encuentra el valor correcto y se detiene.
  if old.colores_disponibles is distinct from new.colores_disponibles then
    perform public.erp_sync_product_colors(new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists products_sync_colors on public.products;
create trigger products_sync_colors
  after update of color, colores_disponibles on public.products
  for each row execute function public.erp_sync_colors_from_product_change();

comment on function public.erp_sync_colors_from_product_change() is
  'P20.29: al cambiar el color del modelo recalcula el de sus unidades, y '
  'deshace cualquier escritura manual sobre la columna derivada.';

-- ============================================================================
-- 5. Relleno inicial
-- ============================================================================
--
-- Con `color = null` en todos los productos, esto deja `{}` en todas partes:
-- correcto y honesto. Se ejecuta igualmente para que la columna quede
-- coherente desde el primer momento y no dependa del primer cambio físico.

do $$
declare
  r record;
begin
  for r in select id from public.products loop
    perform public.erp_sync_product_colors(r.id);
  end loop;
end;
$$;
