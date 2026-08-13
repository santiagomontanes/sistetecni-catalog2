-- Migración 1/4 — Fase 2B "Personaliza tu portátil"
-- Agrega columnas NUEVAS y ADITIVAS a products. No modifica ni elimina
-- ninguna columna existente. Todas nullable — los productos existentes
-- quedan con estos campos vacíos hasta que el admin los complete
-- manualmente (trabajo de datos, no de código).
--
-- Justificación completa de cada columna: docs/fase2a-personalizador-diseno.md §5
--
-- Orden de aplicación: 1 de 4 (products → upgrade_options →
-- product_upgrade_options → quote_requests). Aplicar primero en STAGING,
-- probar, luego en PRODUCTION solo con autorización explícita.

alter table public.products
  add column if not exists cpu_generation     integer,        -- generación numérica del procesador (ej. 8 = "8va gen"); complementa `cpu`/`procesador` (texto libre), no los reemplaza
  add column if not exists gpu_type           varchar(20),    -- 'integrada' | 'dedicada' — filtro de equipo base, casi nunca upgradeable
  add column if not exists gpu_model          text,           -- ej. "NVIDIA MX250" — informativo, no filtrable numéricamente
  add column if not exists touch_screen       boolean default false,  -- filtro de equipo base, característica física del panel
  add column if not exists screen_size_inches numeric(3,1),   -- complementa `screen` (texto libre tipo "14\" FHD") con un número filtrable
  add column if not exists storage_gb         integer;        -- capacidad ACTUAL instalada en GB; complementa `storage`/`almacenamiento` (texto)

comment on column public.products.cpu_generation     is 'Generación numérica del CPU (ej. 8, 10, 11). Filtro de equipo base para el personalizador. No sustituye a cpu/procesador (texto).';
comment on column public.products.gpu_type           is 'integrada | dedicada. Filtro de equipo base — la GPU normalmente no es upgrade en portátiles reacondicionados.';
comment on column public.products.gpu_model          is 'Modelo de GPU dedicada, si aplica. Solo informativo.';
comment on column public.products.touch_screen       is 'Filtro de equipo base — característica física del panel, no upgradeable.';
comment on column public.products.screen_size_inches is 'Tamaño de pantalla en pulgadas, numérico, para filtrar por rango. Complementa a screen (texto libre).';
comment on column public.products.storage_gb          is 'Capacidad de almacenamiento ACTUAL instalada, en GB. Necesaria para el algoritmo de compatibilidad de upgrades.';

-- ---- ROLLBACK ----
-- alter table public.products
--   drop column if exists cpu_generation,
--   drop column if exists gpu_type,
--   drop column if exists gpu_model,
--   drop column if exists touch_screen,
--   drop column if exists screen_size_inches,
--   drop column if exists storage_gb;
