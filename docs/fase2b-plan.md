# Fase 2B — Plan de implementación (propuesto, no iniciado)

**Estado: PLAN. Ningún bloque ha comenzado.** Basado en el diseño cerrado de `docs/fase2a-personalizador-diseno.md`, las 14 decisiones cerradas de `docs/fase2a-decisiones-pendientes.md`, y la estrategia de entornos de `docs/entornos-staging-produccion.md`.

División en 8 bloques pequeños, en orden — cada uno es un punto de parada natural para revisar antes de seguir.

---

## B1 — Preparación de staging y migraciones

**Objetivo:** que exista un entorno STAGING real y verificado antes de escribir una sola línea de lógica de negocio.

**Qué incluye:**
1. Crear el proyecto Supabase de STAGING (tu acción, fuera de esta sesión).
2. Instalar el **Supabase CLI** — herramienta externa nueva, no es una dependencia de `package.json`. Se pedirá confirmación explícita antes de instalarla, igual que con `zod`.
3. `supabase link` al proyecto de STAGING, `supabase db push` para aplicar las 4 migraciones de `supabase/migrations/` en orden.
4. Verificar el resultado con una consulta de descubrimiento adaptada de `docs/fase0-descubrimiento-export.sql` — confirmar columnas/RLS/policies exactamente como se propuso, ahora contra STAGING real.
5. Completar `.env.staging.local` (a partir de `.env.staging.example`).
6. Backfill de **datos ficticios**: ~6–8 productos de prueba variados (algunos con compatibilidad de upgrades definida, uno sin ninguna, uno con `stock=0`) — nunca datos de clientes reales.
7. Construir el **banner de entorno** (§5 de `docs/entornos-staging-produccion.md`) — la primera pieza de código real de la Fase 2B, deliberadamente trivial y de bajo riesgo, para validar que todo el circuito (env vars → build → UI) funciona antes de construir algo más complejo encima.

**Archivos:**
- `src/components/EnvironmentBanner.tsx` (nuevo)
- `src/components/AdminShell.tsx` (modificado — incluye el banner)
- `src/app/layout.tsx` (modificado — incluye el banner también en la web pública, ya que `/personalizar` va a escribir en Supabase igual que el admin)

**Dependencias nuevas:** Supabase CLI (herramienta externa).

**Test de salida del bloque:** el banner muestra "STAGING" corriendo con `.env.staging.local`, y no aparece (o muestra "PRODUCTION") corriendo con `.env.production.local` — confirmación manual antes de seguir.

---

## B2 — Modelo de datos y repositories/server services

**Objetivo:** capa de acceso a datos tipada, sin ninguna UI todavía.

**Qué incluye:**
- Tipos TypeScript para las entidades nuevas.
- Extensión de `src/supabase/db.ts` con los 6 campos nuevos de `products` y funciones de lectura pública de upgrades.
- Un cliente Supabase **server-only** nuevo, separado del cliente de navegador existente — este es el que usa `SUPABASE_SERVICE_ROLE_KEY`.
- Un repositorio de `quote_requests` (crear, leer por código, cambiar estado) que solo se importa desde código server-side.

**Archivos:**
- `src/types/upgrade.ts`, `src/types/quote.ts` (nuevos)
- `src/types/product.ts` (modificado — +6 campos opcionales)
- `src/supabase/db.ts` (modificado — `mapProduct`/`cleanProductPayload` extendidos, nuevas queries de solo lectura para upgrades)
- `src/supabase/admin.ts` (nuevo — cliente server-only)
- `src/supabase/quotes.ts` (nuevo — repositorio de `quote_requests`, server-only)

**Dependencias nuevas:** ninguna adicional a las de B3.

---

## B3 — Algoritmo de matching y cotización

**Objetivo:** toda la lógica de negocio determinista, pura, sin tocar Supabase ni React — el corazón testeable del sistema.

**Qué incluye:**
- Mapeo uso → `RequirementProfile` (flujo "Ayúdame a elegir").
- Algoritmo de matching de equipos base + relajación de requisitos (§9 del diseño).
- Cálculo de precio (§11).
- Generación de código de cotización `COT-XXXXXX` (§12).
- Esquemas Zod de validación, incluido el campo honeypot (D12).

**Archivos:**
- `src/lib/personalizador/profiles.ts`
- `src/lib/personalizador/matching.ts`
- `src/lib/personalizador/pricing.ts`
- `src/lib/personalizador/codigo.ts`
- `src/lib/personalizador/schemas.ts`

**Dependencias nuevas:** **`zod`** — se instala aquí, con confirmación previa. Es la única dependencia npm nueva de toda la Fase 2B.

**Estrategia de tests de este bloque:** unitarios exhaustivos, sin red ni DB (`node --test`, mismo enfoque que ya usa `sistetecni-ai-agent`) — matching con distintos perfiles/presupuestos, cálculo de precio con y sin upgrades, formato y alfabeto del código, rechazo de una combinación de upgrade incompatible, rechazo por honeypot relleno. Este es el bloque con mayor cobertura de tests de todo el proyecto, porque es 100% reproducible sin infraestructura.

---

## B4 — APIs / Server Actions

**Objetivo:** conectar el algoritmo puro (B3) con los datos reales (B2), sin que el navegador pueda decidir nada.

**Qué incluye:**
- Server Actions para el wizard: buscar equipos base, obtener upgrades disponibles, calcular cotización, crear solicitud de cotización.
- Un Route Handler `GET` para consultar una cotización por código (pensado para que el futuro agente lo reutilice).
- Validación Zod en el borde de cada entrada — nunca se confía en un precio que venga del cliente.

**Archivos:**
- `src/app/actions/personalizador.ts` (nuevo, `"use server"`)
- `src/app/api/cotizaciones/[code]/route.ts` (nuevo)

**Estrategia de tests de este bloque:** primeras pruebas de integración reales, contra **STAGING** (nunca producción) — confirman que el Server Action efectivamente lee `products`/`upgrade_options` reales y escribe `quote_requests` reales (de prueba) con el snapshot correcto.

---

## B5 — Wizard público

**Objetivo:** la experiencia de cliente, mobile-first, siguiendo los wireframes de §15 del diseño.

**Qué incluye:**
- Las 6 pantallas del wizard (entrada, Ayúdame a elegir / Personalizar, resultados, configurar upgrades, resumen con desglose colapsable y campo ciudad, confirmación con código).
- Extensión de `WhatsAppButton` con la variante de código de cotización.
- CTA "Personaliza tu portátil" en el catálogo/ficha de producto.

**Archivos:**
- `src/app/personalizar/**` (nuevo, rutas del wizard)
- `src/components/personalizador/**` (nuevo, componentes de cada paso)
- `src/components/WhatsAppButton.tsx` (modificado)
- `src/app/catalog/page.tsx` o `src/components/ProductCard.tsx` (modificado — CTA nuevo)

**Estrategia de tests de este bloque:** manual/E2E en viewport móvil real, ambos flujos completos, incluidos los casos de "sin coincidencia exacta" y "producto agotado".

---

## B6 — Panel administrativo

**Objetivo:** que el admin pueda operar todo lo anterior sin tocar SQL directamente.

**Qué incluye:**
- CRUD de `upgrade_options`.
- Panel de compatibilidad dentro del formulario de producto existente, con el botón "copiar compatibilidad desde otro producto" (D3).
- Listado y detalle de `quote_requests`, cambio de estado entre los 7 valores.
- Backfill de las 6 columnas nuevas para el inventario de **STAGING** (el de producción se hace después, en B8, solo cuando se autorice el despliegue).

**Archivos:**
- `src/app/admin/(panel)/upgrades/page.tsx`, `src/components/AdminUpgradeForm.tsx`, `AdminUpgradeTable.tsx` (nuevos)
- `src/app/admin/(panel)/cotizaciones/page.tsx`, `src/components/AdminQuoteTable.tsx` (nuevos)
- `src/components/AdminCompatibilityPanel.tsx` (nuevo)
- `src/components/AdminProductForm.tsx` (modificado — +6 campos, +panel de compatibilidad)
- `src/components/AdminShell.tsx` (modificado — nav: Upgrades, Cotizaciones)

**Estrategia de tests de este bloque:** manual, flujo administrativo completo contra STAGING.

---

## B7 — Tests de integración sobre staging

**Objetivo:** consolidar y formalizar la cobertura de integración que fue naciendo dispersa en B2–B6, en una suite explícita y repetible.

**Qué incluye:**
- Suite automatizada (mismo runner que ya usa `sistetecni-ai-agent`, `node --test`, sin librería nueva) contra STAGING real: crear producto de prueba → definir compatibilidad → generar cotización → verificar snapshot → verificar unicidad de código.
- Pruebas de seguridad: confirmar que `anon` efectivamente NO puede leer/escribir `quote_requests` directamente (mismo patrón `BEGIN; SET LOCAL ROLE anon; ...; ROLLBACK;` ya diseñado en `docs/00-auditoria-supabase.md` §13.3, o pruebas HTTP reales contra STAGING esperando rechazo).
- Limpieza: los datos de prueba que generan estos tests quedan claramente marcados (ej. `channel` o `customer_note` con un prefijo de test) para poder purgarlos de STAGING periódicamente sin afectar el resto de datos ficticios de demostración.

**Estrategia de tests de este bloque:** es, en sí mismo, la estrategia de tests de integración del proyecto — nunca corre contra producción, siempre contra STAGING.

---

## B8 — Revisión final antes de cualquier deploy

**Objetivo:** punto de control explícito — nada de esto se hace automáticamente, cada ítem requiere tu autorización.

**Checklist:**
- [ ] `docs/fase0.1-correccion-propuesta.sql` (seguridad de `products`/`gallery_images`/Storage) ya aplicado a **producción** — bloqueante, no se despliega el personalizador sin esto (riesgo ya documentado desde la Fase 2A).
- [ ] `supabase/migrations/` aplicadas a producción, en el mismo orden que en staging, sin ningún cambio manual entre ambos — autorización explícita separada.
- [ ] Backfill de datos **reales** de producción (`cpu_generation`, `gpu_type`, etc.) completado por el admin.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` de producción configurada en Vercel (scope Production), nunca en un archivo local ni en Git.
- [ ] Confirmación de que el banner de entorno NO aparece en el build de producción.
- [ ] Solo entonces: deploy — acción tuya, con tu autorización explícita en ese momento.

---

## Resumen — lo que se pidió mostrar

**Dependencias nuevas (total de toda la Fase 2B):**
| Dependencia | Tipo | Bloque | Necesita tu confirmación antes de instalar |
|---|---|---|---|
| Supabase CLI | herramienta externa (no `package.json`) | B1 | Sí |
| `zod` | paquete npm | B3 | Sí |

Nada más — Next.js 15 ya trae Server Actions/Route Handlers nativos.

**Estrategia de staging:** proyecto Supabase separado (D11), datos exclusivamente ficticios, cambio de entorno local vía symlink (`npm run env:staging`/`env:production`), banner visible que hace imposible confundir en cuál se está trabajando. Detalle completo: `docs/entornos-staging-produccion.md`.

**Estrategia de migraciones:** `supabase/migrations/`, 4 archivos versionados con timestamp, convención del Supabase CLI, aplicadas primero a STAGING (B1), nunca a producción sin autorización explícita separada (B8). Detalle completo: `supabase/migrations/README.md`.

**Estrategia de tests:** unitarios puros sin red ni DB (B3, la mayor cobertura), integración contra STAGING únicamente (B4, B7), manual/E2E mobile-first (B5, B6) — nunca contra producción en ningún nivel.

---

*Nada de este plan se ha ejecutado. A la espera de autorización explícita, bloque por bloque, para iniciar B1.*
