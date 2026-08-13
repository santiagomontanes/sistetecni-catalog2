# Motor determinista del personalizador (Fase 2B/B3)

Lógica de negocio **pura**. Ningún archivo de esta carpeta importa Supabase, lee variables de entorno, usa React, ni hace red. Reciben datos ya tipados y devuelven resultados tipados — testeables 100% en memoria.

```
Supabase → Repositorios (B2) → [ este módulo, B3 ] → resultado → B4 (Server Actions) → B5 (wizard)
```

## Archivos

| Archivo | Responsabilidad |
|---|---|
| `types.ts` | `CustomerRequirements`, `MatchResult`, `MatchOutcome`, códigos de motivo |
| `money.ts` | Estrategia monetaria — enteros COP, cálculo de tolerancia sin punto flotante |
| `upgradeSelection.ts` | Elige la opción de upgrade más barata que satisface un mínimo |
| `matching.ts` | Motor principal: filtros fijos + evaluación RAM/storage + clasificación |
| `ranking.ts` | Orden determinista de resultados (tiers + criterio secundario) |
| `code.ts` | Generación de código de cotización (`COT-XXXXXX`), RNG inyectable |
| `snapshot.ts` | Construye el snapshot que B4 guardará en `quote_requests` |
| `schemas.ts` | Validación Zod del input, incluido el honeypot (D12) |

## Principio: características fijas vs. upgrades

`CustomerRequirements` no tiene ningún campo que permita pedir un "upgrade" de CPU/GPU/touch/pantalla — estructuralmente no existe esa posibilidad. Esas cuatro características son **filtros del equipo base**: si no coinciden, el producto es incompatible, sin excepción, sin importar RAM/almacenamiento. Solo RAM y almacenamiento son upgradeables, y únicamente cuando existe una fila confirmada en `product_upgrade_options` (nunca se asume compatibilidad "porque parece posible").

## Semántica de upgrade (D1)

Cada `upgrade_option` es la **configuración final**, no una transición. "16 GB RAM +$70.000" significa que el equipo *termina* en 16 GB — no que se le suman 16 GB a lo que tenía.

## Valores desconocidos

Si el cliente pide un requisito específico (no "cualquiera") y el dato del producto es `null`, se trata como que **no lo cumple**. Nunca se asume a favor de un dato ausente.
