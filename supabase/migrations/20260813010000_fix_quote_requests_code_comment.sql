-- Migración 6 — Fase 2B/B4. Corrección PURAMENTE COSMÉTICA de metadata.
--
-- No altera ninguna columna, tipo, constraint, índice ni policy. Solo
-- corrige el texto de `comment on column quote_requests.code`, que había
-- quedado desactualizado en dos puntos, ambos confirmados en código real:
--
--   1. Decía "sin 0/O/1/I/L" — pero QUOTE_CODE_ALPHABET (src/lib/
--      personalizador/code.ts) SIEMPRE excluyó solo 0/O/1/I y conservó la
--      "L" (para llegar a exactamente 32 símbolos) — esto ya era así desde
--      B3, el comentario de la migración original nunca reflejó el valor
--      real.
--   2. Decía "Formato: COT-XXXXXX" (6 caracteres) — B4 amplió la longitud
--      a 9 caracteres (32^9 ≈ 3.5×10^13 combinaciones, ~45 bits) para que
--      el código sea suficientemente no-enumerable al exponerse vía
--      GET /api/cotizaciones/[code] sin rate limiting (ver entregable de
--      B4, punto 9).
--
-- NO SE APLICÓ TODAVÍA a STAGING en esta sesión — ver entregable de B4,
-- punto 17 (problemas encontrados), pendiente de autorización explícita
-- para push (mismo criterio que toda escritura contra STAGING/producción
-- en este proyecto).
--
-- Orden de aplicación: 6 de 6.

comment on column public.quote_requests.code is 'Identificador amigable, generado server-side con alfabeto sin caracteres ambiguos (sin 0/O/1/I, conserva "L"), no secuencial. Formato: COT-XXXXXXXXX (9 caracteres).';

-- ---- ROLLBACK ----
-- comment on column public.quote_requests.code is 'Identificador amigable, generado server-side con alfabeto sin caracteres ambiguos (sin 0/O/1/I/L), no secuencial. Formato: COT-XXXXXX.';
