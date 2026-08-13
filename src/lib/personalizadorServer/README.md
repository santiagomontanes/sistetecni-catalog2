# src/lib/personalizadorServer — Fase 2B/B4

Capa de orquestación: conecta los repositorios de Supabase (B2,
`src/lib/repositories/`) con el motor determinista puro (B3,
`src/lib/personalizador/`). No implementa NINGUNA regla de
matching/precio/compatibilidad — todas esas decisiones siguen viviendo
exclusivamente en B3. Este módulo solo:

1. valida la forma del input (Zod, aquí y en B3),
2. obtiene datos reales y actuales desde Supabase vía los repositorios de B2,
3. llama a las funciones puras de B3 con esos datos,
4. mapea el resultado a un DTO seguro para cruzar el límite servidor→cliente.

## Diagrama de flujo

```
input (Server Action)
      ↓
validación (Zod, este módulo + B3)
      ↓
repositorios B2 (Supabase STAGING/producción)
      ↓
motor B3 (matchProducts / evaluateCandidate — única fuente de verdad)
      ↓
snapshot B3 (buildQuoteSnapshotFromMatch / buildSpecialQuoteSnapshot)
      ↓
generateQuoteCode() (B3) + reintento ante colisión UNIQUE (codeRetry.ts)
      ↓
QuoteRequestsRepository.create() (B2)
      ↓
DTO público (mappers.ts) → Server Action / Route Handler
```

## El navegador nunca decide precio ni compatibilidad

`crearCotizacionPersonalizada` recibe como máximo un **puntero**
(`selectedProductId`): el id del producto que el cliente eligió entre las
opciones que ya vio. A partir de ahí, TODO se recalcula server-side, ahora
mismo, desde Supabase:

- se relee el producto (`ProductsRepository.findById`) — precio y stock actuales;
- se releen sus upgrades compatibles (`ProductUpgradeOptionsRepository.findCompatibleUpgradesForProduct`) — compatibilidad actual;
- se vuelve a llamar `evaluateCandidate()` (B3) — la única función que decide clasificación/precio/compatibilidad.

Nada que el cliente pueda haber enviado (`selectedUpgrades`, `basePrice`,
`finalPrice`, etc.) se lee en ningún punto de `createQuote.ts` — ese campo
simplemente no existe en `CreateQuoteInput` (ver `types.ts`).

## Cotización especial — mismo principio

Si el cliente pide una cotización especial (`wantsSpecialQuote: true`), el
servidor vuelve a correr la búsqueda COMPLETA (`matchProducts` sobre todos
los candidatos actuales) y solo la honra si `specialQuoteRequired` es
realmente `true` en ese momento. Un cliente no puede forzar una cotización
especial simplemente afirmando que no encontró nada — el servidor lo
verifica de nuevo.

## Honeypot — respuesta neutral

Tanto `buscarOpcionesPersonalizadas` como `crearCotizacionPersonalizada`
detectan el honeypot (B3, `isHoneypotTriggered`) y, si se disparó, devuelven
exactamente la misma forma de respuesta que un fallo de validación
genérico: `{ ok: false, error: "VALIDATION_ERROR", issues: ["Solicitud
inválida."] }`. Nunca se distingue "tu payload tenía forma inválida" de
"activaste el honeypot" — un bot no puede usar la respuesta para adaptar el
ataque. El honeypot NUNCA llega a crear una `quote_request` ni a ejecutar
ninguna consulta a Supabase (el chequeo ocurre antes de tocar los
repositorios).

## Colisión de código (UNIQUE `quote_requests.code`)

`codeRetry.ts` reintenta la inserción hasta `MAX_CODE_ATTEMPTS` (3) veces,
pero ÚNICAMENTE cuando el error es una violación del UNIQUE de `code`
(Postgres SQLSTATE `23505`, ver `isUniqueCodeViolation`). Cualquier otro
error de base de datos (timeout, permisos, columna inválida, etc.) se
propaga de inmediato, sin reintentar — reintentar un error que un nuevo
código no puede resolver solo ocultaría el problema real.

## El GET por código nunca recalcula

`quoteLookup.ts` lee exclusivamente los campos ya congelados en la fila de
`quote_requests` (el snapshot de B3). Nunca vuelve a consultar
`products`/`upgrade_options` para "actualizar" el precio mostrado — ver el
comentario en `buildQuoteSnapshotFromMatch` (B3) y el ejemplo en el
entregable de B4.
