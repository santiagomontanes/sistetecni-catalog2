# 18 · Diseño: ciclo de vida del equipo (pasos 2 a 5)

Estado: **propuesta para revisión. No se ha aplicado nada a ninguna base.**
Rama de trabajo: `fix/entrada-unica-taller`. Paso 1 (costo obligatorio al recibir) ya está hecho en el código.

## 1. Por qué

Hoy las reglas del equipo viven repartidas entre formularios, triggers y convenciones. Consecuencias ya vistas:

- Había cuatro puertas de entrada de equipos; ahora el código solo deja una (Taller), pero la base de datos aún acepta las viejas.
- «Malo» en la recepción solo decide la fase inicial (`warehouse`). No se vuelve a mostrar y no hay un destino explícito.
- `workshop_phase` cambia sin validar la transición (solo `status` tiene matriz `erp_unit_transition_allowed`).
- Bodega es una **fase** (en qué paso va) y también un lugar (dónde está). Mezcla dos preguntas distintas.
- Los equipos en `warehouse` o `ready` no aparecen en el reporte de equipos detenidos.
- Las piezas sacadas de un equipo malo entran con costo 0 en el equipo que las recibe.

## 2. Lo que ya existe y se reutiliza (no se crea nada paralelo)

| Necesidad | Ya existe | Decisión |
|---|---|---|
| Historial del Taller | `workshop_events` (antes/después, motivo, `reversal_of`, `operation_id`, actor) | Se reutiliza. **No** se crea `unit_events`. |
| Historial comercial | `inventory_movements` (`from_status`, `to_status`, motivo, referencia) | Se reutiliza para cambios de `status`. |
| Auditoría general | `audit_events` | Sin cambios. |
| Libro de costos | `cost_entries` (`cost`/`reversal`, categorías, `reversal_of_id`) | Se reutiliza; se agregan categorías. |
| Idempotencia | `workshop_operations` (id de operación) | Sin cambios. |
| Matriz de `status` | `erp_unit_transition_allowed(from,to)` | Se conserva. Se agrega una equivalente para fases. |

## 3. Paso 2 · Transiciones de fase validadas

**Objetivo:** que `workshop_phase` solo pueda cambiar por caminos permitidos y que cada cambio quede en `workshop_events`.

- Nueva función `erp_workshop_phase_allowed(from_phase, to_phase) returns boolean` (inmutable), igual de simple que la de `status`.
- Matriz propuesta (a confirmar):

| Desde | Hacia |
|---|---|
| `reception` | `diagnosis`, `technical`, `aesthetic`, `ready`* |
| `diagnosis` | `technical`, `aesthetic`, `final_check`, `reception` |
| `technical` | `diagnosis`, `aesthetic`, `final_check` |
| `aesthetic` | `technical`, `final_check` |
| `final_check` | `technical`, `aesthetic`, `ready` |
| `ready` | `final_check` (reabrir) |

\* `ready` sigue exigiendo los controles obligatorios (`erp_workshop_guard_unit`), sin cambios.

- El comando `phase` de `erp_workshop_command` valida con esta función y rechaza con un mensaje claro.
- Hacia atrás se permite siempre que exista motivo (se guarda en `workshop_events.reason`).
- **Riesgo:** unidades que hoy tengan una fase que la matriz nueva no permita seguir. Mitigación: la matriz valida solo transiciones **nuevas**, no revalida las existentes. Antes de aplicar se corre un `SELECT` de solo lectura para ver cuántas unidades están en cada fase.

## 4. Paso 3 · Destino en vez de «Malo», y Bodega como ubicación

**Objetivo:** que un equipo en mal estado tenga un destino claro y que Bodega deje de ser una fase.

- Nueva columna `product_units.disposition text` con `check (disposition in ('repair','parts','as_is','scrap'))`, **nullable** (las unidades viejas quedan como están).
- Se decide en la recepción o en el diagnóstico (no solo a la entrada):

| Destino | Qué implica |
|---|---|
| `repair` | Flujo normal del Taller |
| `parts` | Se despieza; su costo se reparte (paso 4) |
| `as_is` | Puede venderse con etiqueta visible en la ficha |
| `scrap` | Se retira con motivo y se registra la pérdida (paso 4) |

- `preliminary_condition = 'bad'` deja de mandar la unidad a la fase `warehouse`. La unidad nace en `reception` con destino pendiente y una alerta visible en la ficha («Entró como Malo — defina destino»).
- Bodega pasa a ser una **ubicación** (`workshop_locations`), no una fase. La fase `warehouse` se deja en el enum por compatibilidad con datos antiguos, pero ya no se ofrece en el selector.
- Los equipos detenidos se miden por tiempo en cualquier estado salvo `sold`/`retired`; `ready` tiene su propio plazo de «listo sin vender».
- La ficha muestra `preliminary_condition` y `disposition` (hoy no se muestran).
- Cambiar el destino exige motivo y queda en `workshop_events`.
- **Riesgo:** unidades antiguas en `warehouse`. Se muestran con «destino sin definir» y se pueden clasificar una a una. No se migran automáticamente.

## 5. Paso 4 · Costos al despiezar y al retirar

**Objetivo:** que la utilidad no se infle ni se pierda dinero sin registro.

- Nuevas categorías en `cost_entries`: `write_off` (pérdida al retirar) y `parts_transfer` (costo que se traslada de un equipo a una pieza). Cambio de `check` de categorías, sin tocar filas existentes.
- **Al sacar una pieza de un equipo con destino `parts`:** el sistema propone un costo asignado y el operador lo confirma. Regla por defecto: costo del equipo repartido en partes iguales entre las piezas que se extraen. Queda como asiento `reversal` en el equipo origen y asiento `parts_transfer` en la pieza.
- **Al retirar (`scrap`):** el costo restante del equipo origen se registra como `write_off` con motivo obligatorio.
- Se mantiene la inmutabilidad: los asientos no se editan, solo se reversan.
- **Decisión pendiente (usted):** el reparto por partes iguales es el más simple pero no refleja que una RAM DDR4 vale distinto que un cargador. Alternativas: por valor de mercado estimado (más exacto, más trabajo) o dejar que el operador escriba el valor. Recomiendo empezar con «el operador escribe el valor, con sugerencia de partes iguales».

## 6. Paso 5 · Cerrar las puertas viejas y vista pública

Este paso toca producción. Requiere acceso de lectura a la base real, respaldo previo, script de reversa y su «publica».

1. `revoke execute` de `erp_receive_product_unit` y `erp_receive_purchase_batch` para `authenticated` (el código ya no las llama).
2. Bloquear que un computador **no gestionado por Taller** pase a `available` o se venda sin pasar por Taller. Antes: contar con `SELECT` cuántas unidades de producción están en esa situación.
3. Permitir que Taller adopte una unidad existente escaneando su propio STU, sin etiqueta alias.
4. Vista `catalogo_publico` derivada de `available`, para que la web lea una sola fuente. Revisar los triggers de stock que hoy se pisan (`erp_guard_managed_product_stock`).
5. Actualizar `17-handover-entrega.md` (falta `20261102010000`) y `taller.md`.

## 7. Cómo se construye cada paso

Cada paso es una migración propia, con su script de reversa y sus pruebas:

1. Migración + prueba en la base local (`npm run test:operational`).
2. Pruebas que **intentan romper** la regla (transición inválida, `UPDATE` directo, costo negativo).
3. Cambio en la interfaz y prueba E2E.
4. Commit en la rama. Nada se sube ni se aplica a producción sin su «publica».

## 8. Lo que NO se hace

- No se reescriben datos existentes. Todo cambio es aditivo (columnas nullable, `check` que valida lo nuevo).
- No se crea un historial paralelo.
- No se reparte el costo de unidades viejas hacia atrás.
- No se activa ninguna alerta por WhatsApp.

## 9. Decisiones que necesito de usted

1. ¿La matriz de fases de la sección 3 refleja cómo trabajan en el Taller? (en especial: ¿puede un equipo saltar de `reception` a `ready`?).
2. Destinos de la sección 4: ¿están completos o falta alguno (por ejemplo «devolver al proveedor»)?
3. Reparto de costo al despiezar (sección 5): ¿partes iguales con ajuste manual?
4. ¿Plazo en días para marcar un equipo como detenido, y otro para «listo sin vender»?
