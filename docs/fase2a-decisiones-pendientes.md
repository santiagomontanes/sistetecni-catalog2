# Fase 2A — Decisiones pendientes antes de autorizar 2B

Extraído de `docs/fase2a-personalizador-diseno.md` y `docs/fase2a-migracion-propuesta.sql`, más las 14 áreas (A–N) que pediste revisar específicamente. Nada implementado, nada ejecutado.

**Cómo está organizado:** solo entran aquí las decisiones que de verdad requieren tu criterio de negocio/producto. Las que pude resolver analizando el código real o el esquema confirmado están en la sección "Resuelto por análisis" al final, con la respuesta ya cerrada — no te las vuelvo a preguntar.

---

## D1 — Modelo de upgrades (brief, sección A)

**Decisión:** ¿el precio de un upgrade depende de "de dónde parte" el equipo, o solo de "a dónde llega"?

- **Opción A — Origen → destino:** cada combinación tiene su propio precio (8GB→16GB = $70.000, 4GB→16GB = $90.000, ...).
- **Opción B — Opción final independiente:** "16 GB RAM = +$70.000", sin importar si el equipo venía con 4, 8 o 12 GB.

**Recomendación: Opción B.** *(Ya es lo que construí en `docs/fase2a-migracion-propuesta.sql` — esta decisión confirma o corrige esa elección de diseño.)*

**Por qué:** la Opción A crece en O(n²) — cada nuevo valor de RAM que aparezca en inventario (4, 8, 12, 16...) obliga a definir su precio hacia CADA destino posible, y hay que mantenerlo actualizado por cada combinación. En la práctica, cambiar un módulo de RAM cuesta casi lo mismo sin importar el valor exacto de origen (es la misma operación física: retirar/agregar un módulo). El disclaimer "sujeto a validación final" ya cubre el caso raro donde el origen sí importa (ej. no hay slot libre).

**Impacto técnico:** Opción B = cero cambios al esquema ya propuesto. Opción A requeriría rediseñar `upgrade_options` con columnas `from_value`/`to_value` y una tabla más grande.

**Impacto en experiencia del cliente:** con B, la UI de todos modos muestra "Actual: 8GB → Disponible: 16GB (+$70.000)" — el cliente ve el origen aunque el precio no dependa de él.

**Impacto en WhatsApp/agente:** ninguno — transparente a ese nivel.

**Dificultad de cambiar después:** **media.** Se puede migrar de B a A agregando columnas a `upgrade_options` sin romper cotizaciones históricas (los snapshots ya congelaron `label`/`value`/`extra_cost`), pero implica repoblar la tabla con la matriz completa y ajustar el algoritmo de precio.

---

## D2 — Estructura de precio del upgrade (brief, sección B)

**Decisión:** ¿qué guardamos del costo de cada upgrade?

- **Opción A:** solo `extra_cost` (precio final público).
- **Opción B:** `extra_cost` + `component_cost` + `install_cost`, estos dos últimos opcionales e internos.
- **Opción C:** fórmula automática de margen (`extra_cost` calculado desde costo + mano de obra + % de margen).

**Recomendación: Opción B.** *(Ya construida en el SQL propuesto.)*

**Por qué:** dijiste que quieres poder administrar márgenes en el futuro — la Opción A no deja ni un lugar donde escribir esos datos después. La Opción C obliga a definir una fórmula de margen (¿fijo? ¿por categoría?) sin tener todavía datos reales de rentabilidad por upgrade — sobrediseño prematuro.

**Impacto técnico:** ninguno adicional, ya está en la migración propuesta.

**Impacto en experiencia del cliente:** ninguno — `component_cost`/`install_cost` nunca se muestran al cliente, solo `extra_cost`.

**Impacto en WhatsApp/agente:** ninguno.

**Dificultad de cambiar después:** **fácil.** Pasar de B a una fórmula de margen (C) más adelante es agregar una columna calculada o una vista, sin tocar snapshots existentes.

---

## D3 — Compatibilidad: ¿por producto individual o por modelo/familia? (brief, sección C)

**Decisión:** cómo se define qué upgrades admite cada equipo.

- **Opción A:** compatibilidad por `product_id` individual (cada fila del catálogo define la suya) — es lo que hay en la migración propuesta.
- **Opción B:** compatibilidad compartida por `model` (texto) — "todos los T480 comparten compatibilidad".
- **Opción C (síntesis, mi recomendación):** Opción A en el esquema, más una utilidad en el panel admin para **copiar/duplicar compatibilidad desde otro producto** al crear uno nuevo.

**Recomendación: Opción C.**

**Por qué:** la Opción B parece resolver el trabajo repetitivo, pero depende de que `model` se escriba **exactamente igual** cada vez — hoy es un campo de texto libre sin validación (confirmado en el esquema real: `character varying`, sin `CHECK`, sin catálogo de valores). Un producto nuevo cargado como "Thinkpad T480" en vez de "T480" quedaría **silenciosamente sin ninguna compatibilidad heredada**, y nadie lo notaría hasta que un cliente reporte que no ve upgrades en un equipo que sí los admite — exactamente el tipo de falla silenciosa que la Fase 0.1 ya identificó como patrón de riesgo en este proyecto. La Opción C resuelve el trabajo repetitivo (el problema real que planteas) sin introducir esa fragilidad: la compatibilidad sigue siendo explícita y a prueba de errores tipográficos, solo que crearla para un producto nuevo toma un clic en vez de rehacerla desde cero.

**Impacto técnico:** A/C no requieren tabla adicional. B requeriría además normalizar `model` (o crear una tabla de familias) para no depender de coincidencia exacta de texto — trabajo de esquema mayor que no resuelve el riesgo, solo lo desplaza.

**Impacto en experiencia del cliente:** indirecto pero real — un error de compatibilidad "fantasma" (B con un typo) se traduce en mostrarle al cliente que un equipo no admite upgrades que en realidad sí admite, perdiendo una venta.

**Impacto en WhatsApp/agente:** ninguno directo.

**Dificultad de cambiar después:** **media.** Pasar de A/C a un modelo de familias reales (tabla `product_families` con relación formal) es viable más adelante sin romper cotizaciones históricas, pero es trabajo de esquema real, no un ajuste menor.

---

## D4 — ¿Agregar batería/peso a `products` ahora?

**Decisión:** el brief pide poder priorizar "más liviano" o "mayor duración de batería" — hoy no hay ninguna columna para eso.

- **Opción A:** agregar `battery_life_hours`, `weight_kg` (nullable) en esta fase.
- **Opción B:** no agregarlas todavía; esas preferencias quedan como desempate suave sin filtrar nada, documentado honestamente en la UI.

**Recomendación: Opción B.**

**Por qué:** hoy **cero productos** tendrían el dato poblado — agregar las columnas ahora solo añade trabajo de backfill sin ningún beneficio inmediato, mientras el resto del personalizador (RAM/CPU/almacenamiento/pantalla) ya tiene datos reales que respaldar. Mejor lanzar con esas dos preferencias declaradas como "no determinantes todavía" que fingir que sí filtran.

**Impacto técnico:** mínimo cualquiera de las dos — son columnas aditivas simples.

**Impacto en experiencia del cliente:** con B, el cliente igual puede marcar la preferencia; el sistema es honesto en que hoy no cambia el resultado, solo el orden en caso de empate.

**Impacto en WhatsApp/agente:** ninguno.

**Dificultad de cambiar después:** **fácil.** Agregar las columnas en cualquier momento futuro no afecta nada existente.

---

## D5 — Datos del cliente antes de abrir WhatsApp (brief, sección F)

**Decisión:** ¿pedimos nombre/teléfono/ciudad en la web antes del botón de WhatsApp?

- **Opción A:** no capturar nada — solo configuración + código.
- **Opción B:** capturar nombre + teléfono + ciudad, obligatorios.
- **Opción C (mi recomendación):** capturar únicamente **ciudad**, opcional, sin bloquear el flujo.

**Recomendación: Opción C.**

**Por qué:** pedir teléfono/nombre ANTES de abrir WhatsApp es fricción redundante — en cuanto el cliente escribe por WhatsApp, ese canal **ya** entrega su número identificado, sin que tengan que volver a escribirlo. Bloquear el paso final con un formulario extra arriesga perder conversiones justo antes de la conversión, y contradice el requisito explícito del brief de que el flujo sea "rápido, sencillo". Ciudad sí aporta algo que WhatsApp no da automáticamente (contexto de envío/logística) a costo casi nulo de fricción, por eso la dejo opcional pero disponible.

**Impacto técnico:** `quote_requests.customer_note` ya alcanza para esto sin columna nueva; si prefieres un campo dedicado (`customer_city`) es igual de trivial.

**Impacto en experiencia del cliente:** mantiene el flujo corto que pide el brief.

**Impacto en WhatsApp/agente:** ninguno — el agente de todos modos necesitará confirmar/pedir datos en la conversación real.

**Dificultad de cambiar después:** **fácil.** Agregar captura de más datos de cliente más adelante es aditivo, no rompe nada existente.

---

## D6 — Expiración de la cotización (brief, sección G)

**Decisión:** ¿la cotización caduca? ¿en cuánto tiempo?

- **Opción A:** sin expiración.
- **Opción B:** con expiración, **7 días** por defecto.
- **Opción C:** con expiración, 15 días o más.

**Recomendación: Opción B, 7 días.**

**Por qué:** el inventario reacondicionado tiene rotación relativamente rápida (unidades limitadas por configuración) — 7 días le da al cliente tiempo suficiente para decidir por WhatsApp sin que el precio/config congelados queden peligrosamente desactualizados frente a lo que realmente hay disponible. 15+ días aumenta el riesgo de cotizaciones que en la práctica ya no se pueden honrar (producto vendido) pero que el sistema sigue mostrando como vigentes.

**Impacto técnico:** la columna `expires_at` ya existe en el esquema propuesto (nullable) — solo falta que el Server Action la calcule (`created_at + 7 días`) al crear la fila. No requiere cambio de estructura.

**Impacto en experiencia del cliente:** aparece como fecha límite en el resumen — genera una urgencia comercial razonable, no agresiva.

**Impacto en WhatsApp/agente:** relevante — el agente puede usar `expires_at` para saber si debe recalcular/reconfirmar antes de cerrar una venta con una cotización vieja, evitando que confirme un precio ya vencido.

**Dificultad de cambiar después:** **fácil.** Es un número en código (`+7 días`), no un cambio de esquema.

---

## D7 — Comportamiento de equipos sin stock (brief, sección H)

**Decisión:** ¿qué hace el personalizador con un producto en `stock=0`?

- **Opción A:** nunca aparece en recomendaciones.
- **Opción B:** aparece como referencia (badge "Agotado"), sin permitir cotización normal.
- **Opción C:** aparece y permite generar una cotización especial ("avísame cuando haya disponible").

**Recomendación: B + C combinadas.**

**Por qué:** ocultarlo por completo (A) pierde la señal de que ese modelo existe y podría interesarle al cliente aunque hoy no haya unidades — reduce la sensación de catálogo completo sin necesidad. Mostrarlo como referencia con un CTA distinto ("avísame") en vez de "cotizar ahora" es honesto y mantiene la puerta abierta comercialmente. Es la misma línea que ya adopté en el diseño original de la Fase 0 para el catálogo público — consistente con lo ya acordado.

**Impacto técnico:** ya cubierto por `is_special_request`/`status` existentes — no requiere columna nueva, solo lógica de UI distinguiendo `stock=0`.

**Impacto en experiencia del cliente:** evita un "no encontramos nada" innecesario cuando el modelo sí existe, solo está agotado ahora mismo.

**Impacto en WhatsApp/agente:** el agente podría usar esto más adelante para avisar proactivamente cuando reingrese stock (tool futura, no en 2B).

**Dificultad de cambiar después:** **fácil.** Es una regla de UI/filtro, no de esquema.

---

## D8 — Cómo tratar el presupuesto (brief, sección I)

**Decisión:** ¿el presupuesto es un tope duro, una preferencia, o admite tolerancia?

- **Opción A:** restricción dura — nunca mostrar nada por encima.
- **Opción B:** preferencia con tolerancia hacia arriba de **+15%** *(ya está en el algoritmo de §9 del diseño)*.
- **Opción C:** preferencia sin ningún límite de tolerancia.

**Recomendación: Opción B, confirmando 15% — y aclarando que la tolerancia es SOLO hacia arriba** (nunca se penaliza encontrar algo más barato que el presupuesto).

**Por qué:** la Opción A puede dejar al cliente sin ninguna opción por una diferencia de $10.000 — mala experiencia comercial y probablemente una venta perdida sin necesidad. La Opción C sin límite puede terminar mostrando algo 3 veces el presupuesto, lo que tampoco ayuda ni respeta la intención declarada por el cliente. 15% es lo bastante generoso para no perder coincidencias cercanas sin dejar de respetar el presupuesto como señal real.

**Para tu ejemplo concreto** ($600.000 de presupuesto, mejor coincidencia a $630.000 = 5% sobre): **sí se muestra**, etiquetado explícitamente como "$30.000 sobre tu presupuesto" — nunca oculto.

**Impacto técnico:** ya está en el algoritmo (§9, paso 4, ítem 6) — esta decisión solo confirma el número exacto.

**Impacto en experiencia del cliente:** transparencia total sobre cuánto se excede, cuando se excede.

**Impacto en WhatsApp/agente:** ninguno directo.

**Dificultad de cambiar después:** **fácil.** Es una constante ajustable en código.

---

## D9 — Estados de `quote_requests`: ¿agregar `'contactada'`? (brief, sección M)

**Decisión:** ¿los 6 estados originales bastan, o se agrega un 7º?

- **Opción A:** los 6 propuestos (`nueva, en_revision, cotizada, aceptada, rechazada, expirada`).
- **Opción B:** agregar `'contactada'`, entre `en_revision` y `cotizada`.

**Recomendación: Opción B.**

**Por qué:** `en_revision` no distingue entre "nadie la ha visto todavía" y "ya se le escribió al cliente por WhatsApp y la conversación sigue abierta" — es una distinción real de proceso de ventas, más todavía cuando el agente empiece a participar en esas conversaciones y necesite reflejar ese estado con precisión.

**Impacto técnico:** cambio trivial al `CHECK` constraint — sin filas existentes que migrar (la tabla no existe todavía).

**Impacto en experiencia del cliente:** ninguno, es un dato interno del panel admin.

**Impacto en WhatsApp/agente:** directo — `'contactada'` es exactamente el estado que el agente asignaría al iniciar la conversación.

**Dificultad de cambiar después:** **fácil.** Un `ALTER` del `CHECK` en cualquier momento, incluso con datos ya cargados (mientras ninguna fila use un valor que se elimine).

---

## D10 — ¿Unificar el botón "Cotizar por WhatsApp" existente en `/product` con `quote_requests`?

**Decisión:** hoy ese botón genera un enlace `wa.me` sin persistir nada. ¿Lo hacemos pasar por `quote_requests` (con código) en esta misma fase, o se deja tal cual?

- **Opción A:** unificar ahora, en la Fase 2B.
- **Opción B:** dejar el botón actual como está; `quote_requests` nace solo para el personalizador nuevo.

**Recomendación: Opción B para la Fase 2B — unificar después, en una fase corta e independiente.**

**Por qué:** unificarlo ahora amplía el radio de cambio de esta fase a un flujo que hoy **ya funciona bien** y que no formaba parte del alcance original de "Personaliza tu portátil" — mezclarlo aumenta el riesgo de la entrega sin necesidad real. Es un cambio de bajo costo hacerlo después, una vez el patrón `quote_requests` ya esté probado en producción con el personalizador.

**Impacto técnico:** con B, conviven temporalmente dos caminos de cotización (uno con código y snapshot, otro sin ninguno) — inconsistente pero no roto.

**Impacto en experiencia del cliente:** con B, quien cotiza un producto tal cual desde `/product` no recibe código ni queda registrado — pierde trazabilidad hasta que se unifique.

**Impacto en WhatsApp/agente:** con B, el agente **no podrá** consultar cotizaciones que vinieron del botón viejo — solo las que pasaron por el personalizador. Limitación real pero temporal y de bajo costo, dado que el brief no pidió tocar ese botón.

**Dificultad de cambiar después:** **fácil.** Técnicamente es enrutar el botón existente por el mismo Server Action en vez de construir el enlace `wa.me` directamente — un cambio pequeño y aislado.

---

## D11 — Proyecto Supabase de prueba/staging

**Decisión:** ¿usamos un proyecto Supabase separado para pruebas de integración de la Fase 2B, o nos apoyamos únicamente en el patrón transacción+`ROLLBACK` sobre producción?

- **Opción A:** proyecto Supabase de staging separado.
- **Opción B:** sin staging — pruebas de integración vía transacciones con `ROLLBACK` garantizado sobre producción (mismo patrón ya diseñado en `docs/00-auditoria-supabase.md` §13.3).

**No doy una recomendación cerrada aquí** — a diferencia de las demás, esta depende de algo que no puedo evaluar por ti: cuánta carga operativa estás dispuesto a asumir manteniendo un segundo proyecto sincronizado con cada migración futura. Si tuviera que inclinarme, A es más seguro (separa por completo el riesgo de que una prueba rota afecte producción), pero es una decisión sobre tu capacidad operativa, no sobre el diseño técnico.

**Impacto técnico:** A separa completamente pruebas de producción; B es más simple de mantener pero conlleva más riesgo por prueba.

**Impacto en experiencia del cliente / WhatsApp/agente:** ninguno directo en ambos casos.

**Dificultad de cambiar después:** **media.** Crear un staging después de haber empezado es viable, pero implica replicar el esquema ya migrado hasta ese punto.

---

## D12 — Rate limiting / anti-spam para `quote_requests`

**Decisión:** ¿construimos alguna protección anti-spam en la Fase 2B, o se documenta como riesgo aceptado para después?

- **Opción A:** construir algo básico ahora (mínimo: un campo honeypot).
- **Opción B:** no construir nada en 2B, documentado como riesgo residual (ya está así en §20 del diseño).

**Recomendación: Opción A, con el mínimo viable: un honeypot** (campo oculto que un bot llenaría automáticamente y un humano nunca ve) — no rate-limiting real por IP, que sí requeriría más infraestructura.

**Por qué:** dado el canal de entrada esperado (tráfico de redes sociales, sin ningún filtro previo), un formulario público sin ninguna fricción anti-bot es un blanco fácil desde el primer día, y una tabla de cotizaciones llena de basura le resta utilidad al panel admin justo cuando más se necesita que sea confiable. Un honeypot es prácticamente gratis de construir (un campo extra, sin dependencias, sin servicios externos).

**Impacto técnico:** bajo.

**Impacto en experiencia del cliente:** ninguno — invisible para humanos.

**Impacto en WhatsApp/agente:** evita que el agente reciba códigos de cotizaciones falsas para "confirmar".

**Dificultad de cambiar después:** **fácil.** Se puede reforzar más adelante (rate-limiting real por IP) sin romper lo básico ya construido.

---

## D13 — Desglose de precio: completo, solo final, o ambos (brief, sección E)

**Decisión:** cómo se presenta el precio estimado en la pantalla de resumen.

- **Opción A:** solo el precio final.
- **Opción B:** desglose completo siempre visible.
- **Opción C (mi recomendación):** ambos — precio final grande y prominente, desglose visible pero secundario (colapsable o en texto más pequeño debajo).

**Recomendación: Opción C.**

**Por qué:** mostrar solo el final (A) oculta el "por qué" del precio, justo en una compra que ya de por sí puede generar dudas (equipo reacondicionado + personalización) — reduce confianza. Mostrar SIEMPRE el desglose completo desplegado (B) compite visualmente con el llamado a la acción principal. El híbrido es el patrón estándar en configuradores de e-commerce (aerolíneas, autos, tecnología) precisamente porque equilibra ambos objetivos.

**Impacto técnico:** ninguno — es una decisión de interfaz; el backend ya calcula y devuelve el desglose completo de todos modos (§11 del diseño).

**Impacto en experiencia del cliente:** mejora la confianza sin sacrificar la claridad del CTA principal — favorece conversión.

**Impacto en WhatsApp/agente:** ninguno.

**Dificultad de cambiar después:** **fácil.** Puramente de interfaz, cero impacto en datos ni en el algoritmo.

---

## D14 — Stock de componentes de upgrade (brief, sección D)

**Decisión:** ¿los upgrades tienen cantidad real en inventario, o solo activo/inactivo?

- **Opción A:** activo/inactivo simple *(ya construida en el SQL propuesto)*.
- **Opción B:** cantidad real de repuestos en stock, con descuento por venta.

**Recomendación: Opción A** — coincide directamente con tu propia instrucción ("No quiero construir un ERP de repuestos innecesariamente").

**Por qué:** llevar cantidad real de memorias/discos en inventario es un problema de gestión de repuestos aparte, con su propio flujo de compras y consumo — está fuera del alcance de un configurador de cotizaciones. El disclaimer "sujeto a disponibilidad" (ya presente en el resultado, §11 del diseño) comunica honestamente que un componente puntual podría no estar disponible al momento de confirmar.

**Impacto técnico:** ninguno adicional, ya construido tal cual en la migración propuesta.

**Impacto en experiencia del cliente:** la expectativa queda correctamente puesta desde el disclaimer — no se promete algo que después no se puede validar.

**Impacto en WhatsApp/agente:** la confirmación real de disponibilidad del componente físico queda en manos del agente/humano en la conversación final — consistente con "el backend decide precio y compatibilidad; la disponibilidad física final la confirma una persona en esta fase".

**Dificultad de cambiar después:** **difícil.** Pasar de A a B más adelante no es "agregar una columna" — es construir un mini-ERP de repuestos (tabla de inventario, movimientos de entrada/salida, alertas de bajo stock). Vale la pena que sepas esto de antemano: si algún día decides trackear stock real de repuestos, es un proyecto en sí mismo, no un ajuste.

---

## Resuelto por análisis (no requieren tu decisión)

| Punto | Resolución |
|---|---|
| **Nombres de tablas** | `upgrade_options`/`product_upgrade_options`/`quote_requests` — sin ambigüedad ni alternativa real que aporte algo distinto. Se mantienen. |
| **Server Actions vs. Route Handlers** | Decisión puramente técnica, sin impacto de negocio: Server Actions para el wizard, un único Route Handler (`GET /api/cotizaciones/[code]`) para la futura consulta del agente. Confirmado, no requiere tu criterio. |
| **JSONB vs. tabla hija para `selected_upgrades_snapshot`** | JSONB — los ítems de una cotización ya creada son inmutables, no hay necesidad de `JOIN`/`UPDATE` individual. Reversible después sin romper cotizaciones históricas si algún día se necesita analítica agregada. Decisión técnica, no de negocio. |
| **Trigger `set_updated_at` vs. asignación explícita en el Server Action** *(revisión de mi propia propuesta original)* | Al revisarlo de nuevo: **retiro el trigger de la propuesta.** El Server Action puede escribir `updated_at = now()` explícitamente en cada `UPDATE` desde el panel admin, preservando el patrón "cero lógica en Postgres" que este proyecto mantiene hoy (`docs/00-auditoria-supabase.md` confirmó `funciones: []`, `triggers: []`) — no hay ninguna razón de negocio para romper ese patrón por un campo de auditoría menor. `docs/fase2a-migracion-propuesta.sql` se actualizará para quitar el Bloque 4's trigger/función si apruebas esta revisión. |
| **K — Campos nuevos, ¿deberían vivir en `products` o en otra entidad?** *(re-analizado, brief lo pidió explícitamente)* | Confirmado: `cpu_generation`, `gpu_type`/`gpu_model`, `touch_screen`, `screen_size_inches` y `storage_gb` son atributos de la **configuración específica vendida** (mismo nivel que `cpu`/`ram`/`screen` ya existentes) — no de una "familia" abstracta, porque un mismo modelo puede venderse en variantes reales distintas (ej. T480 con y sin touch son configuraciones/SKUs distintos). Van correctamente en `products`, sin conflicto con la decisión D3 sobre compatibilidad (que es un tema aparte: upgrades, no specs base). |
| **L — Código de cotización: formato y anti-colisión/enumeración** | Ya resuelto en el diseño (§12): `COT-` + 6 caracteres de un alfabeto de 32 símbolos sin caracteres ambiguos (sin `0/O/1/I/L`) → ≈1.070 millones de combinaciones, generado server-side (no secuencial, no expone el `id` uuid interno), con reintento acotado si colisiona. No hay alternativa que mejore esto sin complejizarlo innecesariamente. |
| **N — Snapshot: qué debe copiarse exactamente** | Confirmado y con un ajuste: `base_price_snapshot` (numeric) + `base_config_snapshot` (jsonb: `title, brand, model, cpu, ram, storage, screen, condition`, **y agrego `images[0]`** — la imagen principal, para que el panel admin muestre la cotización histórica con su foto real aunque el producto cambie de imágenes después) + `selected_upgrades_snapshot` (jsonb: `category, label, value, extra_cost` de cada upgrade elegido, en el momento exacto). Con esto, una cotización histórica es 100% reconstruible aunque `products`/`upgrade_options` cambien o incluso se borren filas después (dentro de los límites de `ON DELETE RESTRICT` ya definidos). |
| **J — Regla para productos similares cuando no hay coincidencia exacta** | Ya diseñada en el algoritmo de relajación (§9, paso 4): 7 pasos en orden fijo (marca → touch → rango de pantalla → GPU dedicada → generación de CPU → presupuesto +15% → mínimos de RAM/almacenamiento), cada uno registrado para mostrarle al cliente qué cambió. No requiere una decisión adicional — el orden es ajustable después sin ningún costo (es una lista en código). |

## Acciones pendientes (no son decisiones de diseño)

- **`npm install zod`** — no se ha ejecutado. Se instalará al iniciar la Fase 2B, dado que ya está aprobada la arquitectura que lo requiere (Server Actions + validación).
- **`SUPABASE_SERVICE_ROLE_KEY`** — deberás obtenerla del dashboard de Supabase y agregarla como variable de entorno **server-only** en Vercel cuando llegue el momento de desplegar (no antes, no en este chat).

---

## RECOMENDACIÓN DE CONFIGURACIÓN PARA SISTETECNI

| # | Decisión | Recomendación |
|---|---|---|
| D1 | Modelo de upgrades | **Opción B** — precio por opción final ("16GB = +$70.000"), no por combinación origen→destino |
| D2 | Estructura de precio del upgrade | **Opción B** — `extra_cost` público + `component_cost`/`install_cost` opcionales/internos |
| D3 | Compatibilidad | **Opción C** — por `product_id` individual + utilidad de copiar/duplicar en el panel admin |
| D4 | Batería/peso en `products` | **Opción B** — no agregar todavía |
| D5 | Datos del cliente antes de WhatsApp | **Opción C** — solo ciudad, opcional; nada de nombre/teléfono en la web |
| D6 | Expiración de cotización | **Opción B** — sí, `expires_at`, 7 días por defecto |
| D7 | Equipos sin stock | **B + C** — aparecen como referencia con badge "Agotado" + permiten cotización especial tipo "avísame" |
| D8 | Presupuesto | **Opción B** — preferencia con tolerancia +15% hacia arriba, siempre etiquetada cuando se excede |
| D9 | Estados de cotización | **Opción B** — agregar `'contactada'` (7 estados en total) |
| D10 | Unificar botón WhatsApp existente | **Opción B** — no en esta fase; unificar después, en una fase corta aparte |
| D11 | Staging de Supabase | **Sin recomendación cerrada** — depende de tu capacidad operativa; técnicamente A (staging) es más seguro |
| D12 | Anti-spam | **Opción A** — sí, honeypot mínimo en 2B |
| D13 | Desglose de precio | **Opción C** — ambos: final prominente, desglose secundario/colapsable |
| D14 | Stock de upgrades | **Opción A** — activo/inactivo simple, sin cantidades (coincide con tu propia instrucción) |

**Cambios que esto implica sobre lo ya escrito:** ninguno en el modelo de datos salvo D9 (agregar `'contactada'` al `CHECK` de `status`) y retirar el trigger `set_updated_at` (ver "Resuelto por análisis"). Si apruebas esta configuración, el siguiente paso sería actualizar `docs/fase2a-migracion-propuesta.sql` con esos 2 ajustes puntuales antes de considerar la Fase 2A verdaderamente cerrada — **no lo hago todavía, a la espera de tu confirmación.**

---

*Ninguna decisión de este documento fue aplicada. No se ejecutó SQL, no se modificó Supabase, no se tocaron las policies pendientes, no se instaló ninguna dependencia, no se modificó `sistetecni-ai-agent`. A la espera de tu respuesta.*
