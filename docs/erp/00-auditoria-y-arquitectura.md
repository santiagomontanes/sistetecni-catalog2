# SISTETECNI ERP — Fase 0: auditoría y arquitectura base

**Fecha:** 2026-08-27  
**Rama de trabajo:** `erp/fase0-core`  
**Estado:** diseño/auditoría; ninguna migración de este ERP se aplica a producción en esta fase.

## 1. Objetivo

Convertir el panel y la infraestructura existente de SISTETECNI en un ERP único para el negocio de venta de computadores, administrable de dos maneras equivalentes:

1. **Modo manual:** panel web administrativo.
2. **Modo agente:** órdenes del propietario desde WhatsApp, ejecutadas mediante herramientas deterministas y auditables.

La IA no será una segunda base de datos ni una segunda lógica de negocio. El ERP será el núcleo; web, WhatsApp y catálogo público serán interfaces sobre el mismo núcleo.

## 2. Línea base encontrada

El repositorio correcto del sitio actual es `santiagomontanes/sistetecni-catalog2`.

Stack actual relevante:

- Next.js 15 + App Router.
- React 19.
- TypeScript estricto.
- Supabase/PostgreSQL como persistencia principal.
- Supabase Storage para multimedia.
- Zod para validación.
- `pdf-lib` para comprobantes PDF.
- Panel administrativo ya protegido mediante usuario autenticado + `profiles.is_admin`.

El panel ya contiene, entre otros:

- productos;
- cotizaciones;
- personalizador y upgrades;
- multimedia/galería;
- configuración del negocio;
- ventas y generación/descarga de comprobantes.

También existen repositorios y lógica de dominio reutilizable para productos, cotizaciones y ventas.

## 3. Regla arquitectónica principal

**Supabase seguirá siendo la única fuente de verdad comercial.**

No se creará un inventario paralelo en JSON, SQLite, archivos del agente ni otra base independiente.

```text
                    SISTETECNI CORE
                          │
             servicios + repositorios
                          │
                       Supabase
                          │
       ┌──────────────────┼──────────────────┐
       │                  │                  │
       ▼                  ▼                  ▼
   ERP manual        Agente WhatsApp     Web pública
```

Todo cambio realizado por cualquiera de las interfaces debe terminar en las mismas operaciones de dominio.

Ejemplo:

```text
ERP web: “marcar unidad como vendida”
                   │
                   ├──> InventoryService / SalesService
                   │
WhatsApp: “se vendió el Acer serial ABC123”
                   │
                   └──> InventoryService / SalesService
```

No habrá dos implementaciones diferentes de esa operación.

## 4. Activos existentes que NO se deben duplicar

### `products`

Continúa siendo el catálogo maestro de modelos/configuraciones comerciales y la fuente para `sistetecni.com`.

Debe conservar:

- visibilidad web;
- precio;
- stock agregado mientras se migra hacia stock derivado de unidades;
- especificaciones;
- compatibilidades del personalizador;
- fotografías del catálogo.

### Personalizador

Se conservan y reutilizan:

- `upgrade_options`;
- `product_upgrade_options`;
- `quote_requests`;
- matching determinista;
- snapshots de cotización.

### `business_profile`

Continúa siendo fuente de datos configurables del negocio. Número, dirección, horarios y datos públicos no deben quedar hardcodeados en el agente.

### Ventas actuales

La rama principal ya contiene el diseño de:

- `sales`;
- `sale_items`;
- `sale_number_counters`;
- numeración atómica `SV-YYYY-NNNNNN`;
- snapshot inmutable de los artículos;
- PDF de comprobante;
- RLS de administrador.

Estas tablas son la base del futuro módulo comercial y **no se reemplazarán por otras tablas `orders` o `erp_sales` que dupliquen la misma realidad**.

> Importante: el documento actual es un **COMPROBANTE DE VENTA interno**, no una factura electrónica DIAN. La integración DIAN se diseñará como una capacidad separada si se requiere facturación electrónica legal.

## 5. Situación del agente actual

El agente ya utiliza una arquitectura saludable para consultas comerciales:

```text
WhatsApp
  ↓
admisión / dedupe / rate limit
  ↓
pipeline
  ↓
comprensión de intención
  ↓
registro.ejecutar(herramienta)
  ↓
Supabase
  ↓
resultado estructurado
  ↓
redacción
```

Ese patrón se mantiene.

La ampliación ERP **NO permitirá que el LLM ejecute SQL ni utilice libremente una service key**.

La IA solamente podrá solicitar herramientas registradas.

Problema identificado para el ERP: actualmente el agente no posee una identidad administrativa confiable derivada del número remitente. Una frase como “soy el administrador” jamás puede otorgar privilegios.

## 6. Identidad administrativa por WhatsApp

La autenticación administrativa se resuelve en el borde del canal WhatsApp, antes de entregar el mensaje al modelo.

Flujo objetivo:

```text
Webhook Meta validado
      ↓
extraer wa_id real del payload firmado
      ↓
normalizar identidad
      ↓
AdminIdentityResolver
      ↓
actor = owner | staff | customer
      ↓
pipeline / herramientas permitidas
```

Reglas:

1. El número/`wa_id` autorizado vive en configuración segura del servidor, no en el prompt.
2. El cliente no puede ascender privilegios escribiendo “soy el administrador”.
3. El LLM recibe como máximo un contexto estructurado como `actor.role = owner`; no recibe secretos de autenticación.
4. Una herramienta de escritura vuelve a validar permisos en el servidor; no confía únicamente en lo que diga el modelo.
5. Todas las escrituras administrativas originadas por WhatsApp generan auditoría.

La configuración conceptual será similar a:

```text
ERP_ADMIN_WHATSAPP_IDS=<lista segura server-only>
ERP_AGENT_SERVICE_TOKEN=<credencial server-only agente→ERP>
```

Los nombres definitivos se fijarán al implementar el contrato en ambos repositorios.

## 7. Frontera de herramientas del agente

### Herramientas de consulta

Ejemplos:

- `erp_buscar_producto`
- `erp_consultar_inventario`
- `erp_buscar_unidad`
- `erp_buscar_cliente`
- `erp_consultar_venta`
- `erp_resumen_ventas`
- `erp_consultar_envio`
- `erp_consultar_garantia`

Pueden responder datos, pero no cambiar estado.

### Herramientas de operación

Ejemplos:

- `erp_crear_producto`
- `erp_actualizar_producto`
- `erp_publicar_producto`
- `erp_despublicar_producto`
- `erp_recibir_unidad`
- `erp_ajustar_inventario`
- `erp_crear_cliente`
- `erp_crear_venta`
- `erp_registrar_pago`
- `erp_crear_envio`
- `erp_actualizar_envio`
- `erp_adjuntar_imagen_producto`
- `erp_crear_comprobante`
- `erp_crear_garantia`

El resultado siempre será estructurado, por ejemplo:

```json
{
  "ok": true,
  "action": "inventory.unit.received",
  "entityId": "...",
  "auditId": "...",
  "summary": {
    "product": "HP EliteBook 840 G5",
    "serial": "ABC123",
    "status": "available"
  }
}
```

El modelo redacta la respuesta a partir de ese resultado; no inventa el resultado.

## 8. Niveles de riesgo

### Nivel A — lectura / operación reversible de bajo impacto

Ejemplos:

- consultar inventario;
- consultar ventas;
- buscar cliente;
- crear una nota;
- generar una cotización.

El administrador autenticado puede ejecutarlas directamente.

### Nivel B — escritura de negocio normal

Ejemplos:

- crear producto;
- actualizar precio;
- recibir una unidad;
- crear venta;
- registrar pago;
- crear envío;
- publicar/despublicar.

Se ejecutan para un actor autorizado y el sistema devuelve un resumen exacto de lo realizado + auditoría.

### Nivel C — destructivo, masivo o legalmente sensible

Ejemplos:

- anular venta;
- anular documento;
- eliminar producto con historial;
- eliminar cliente;
- ajuste masivo de inventario;
- descuento excepcional;
- cualquier acción irreversible en lote.

Requieren un desafío de confirmación de un solo uso. La confirmación debe identificar la operación y sus entidades; un simple “sí” fuera de contexto no basta.

## 9. Módulos objetivo

### Catálogo

- productos;
- especificaciones;
- precio de venta;
- costo interno;
- visibilidad web;
- imágenes;
- personalizador/upgrades.

### Inventario físico

Se agrega el concepto que hoy falta: **unidad individual**.

Un producto puede representar el modelo comercial, mientras `product_units` representa cada máquina real.

Ejemplo:

```text
Producto: Dell Latitude 7490

Unidad U-001
- serial: ABC123
- estado: disponible
- costo real: 410000
- batería: 88%

Unidad U-002
- serial: DEF456
- estado: vendida
- costo real: 405000
- batería: 81%
```

El stock mostrable termina derivándose de unidades disponibles. Durante la migración se mantendrá compatibilidad con `products.stock` para no romper la web ni el agente.

Estados iniciales propuestos de unidad:

- `received`
- `inspection`
- `available`
- `reserved`
- `sold`
- `warranty`
- `repair`
- `returned`
- `retired`

### Movimientos de inventario

Toda modificación de existencias crea un movimiento; el stock no debe cambiar “mágicamente”.

Tipos iniciales:

- recepción;
- reserva;
- liberación de reserva;
- venta;
- devolución;
- entrada/salida de garantía;
- ajuste manual;
- retiro/baja.

### Clientes

Se creará una entidad `customers` para evitar repetir nombre/documento/teléfono como si fueran clientes nuevos en cada módulo.

Las ventas conservarán sus snapshots históricos aunque el cliente actualice posteriormente sus datos.

### Ventas y pagos

Se amplía `sales`; no se crea otro sistema de ventas.

El pago se normalizará para soportar:

- efectivo;
- transferencia;
- Nequi;
- Daviplata;
- tarjeta;
- contraentrega;
- pago parcial;
- múltiples pagos para una misma venta.

### Envíos

Entidades objetivo:

- `shipments`
- `shipment_events`

Estados iniciales:

- `pending`
- `packing`
- `ready`
- `dispatched`
- `in_transit`
- `destination_city`
- `delivered`
- `not_received`
- `returning`
- `returned`
- `cancelled`

Debe permitir transportadora, guía, ciudad, dirección, costo, modalidad de recaudo y trazabilidad.

### Garantías

Una garantía debe enlazar como mínimo:

- venta;
- unidad física;
- cliente;
- fecha de inicio/fin;
- motivo;
- diagnóstico;
- estado;
- eventos/fotos.

### Compras, proveedores y gastos

Objetivo posterior:

- `suppliers`
- `purchases`
- `purchase_items`
- `expenses`

Permitirán calcular costo real, utilidad y flujo operativo.

### Marketing y leads

El trabajo de campañas Click-to-WhatsApp del agente debe integrarse sin convertirse en otro catálogo.

El ERP tendrá referencia campaña/anuncio → producto(s) promocionados. Cuando se resuelva un `referral.source_id`, el producto sigue saliendo de `products`.

## 10. Multimedia recibida por WhatsApp

La cadena objetivo para fotografías enviadas por el administrador será:

```text
Meta Media ID
   ↓
WhatsAppMediaService (descarga autenticada)
   ↓
ImageValidationService
   ↓
normalización / compresión / orientación
   ↓
StorageService
   ↓
Supabase Storage
   ↓
relación con products/product_units
   ↓
actualización visible en sistetecni.com
```

Reglas:

- nunca guardar una URL temporal de Meta como imagen permanente;
- verificar MIME y tamaño real;
- no confiar en la extensión enviada por el cliente;
- generar nombre/ruta controlados por el servidor;
- conservar orden de galería;
- realizar la misma operación que usa el panel manual, no una ruta paralela específica del bot.

## 11. Auditoría

Se agregará un registro central `audit_events` (nombre final sujeto a migración) para mutaciones relevantes.

Campos conceptuales:

```text
id
created_at
actor_type        web_admin | whatsapp_admin | system
actor_id
channel
operation
entity_type
entity_id
before_snapshot   jsonb nullable
after_snapshot    jsonb nullable
request_id
confirmation_id   nullable
metadata           jsonb
```

No se almacenarán secretos, tokens ni credenciales dentro del log.

## 12. ERP API / servicios

El agente no debe recibir una `SUPABASE_SERVICE_ROLE_KEY` para hacer queries arbitrarias.

La dirección objetivo es:

```text
Agente local
    ↓ HTTPS autenticado
Sistetecni ERP API
    ↓
servicios de dominio
    ↓
repositorios
    ↓
Supabase
```

El panel Next.js podrá reutilizar los mismos servicios directamente server-side.

Para lecturas públicas ya protegidas por RLS se puede conservar el patrón actual con anon key. Para datos privados o escrituras se utilizará una frontera server-only con mínimo privilegio.

## 13. Esquema de datos — primera ampliación propuesta

La primera migración ERP se limitará deliberadamente al núcleo:

```text
customers
product_units
inventory_movements
audit_events
```

Más adelante:

```text
payments
shipments
shipment_events
warranties
warranty_events
suppliers
purchases
purchase_items
expenses
marketing_campaigns
```

No se crearán todavía todas las tablas de una sola vez: cada grupo tendrá invariantes, RLS, pruebas y rollback propios.

## 14. Compatibilidad de inventario

La web actualmente conoce `products.stock`. No se elimina de inmediato.

Transición propuesta:

### Etapa 1

`products.stock` sigue funcionando como hasta hoy. Se agregan unidades físicas sin afectar el catálogo público.

### Etapa 2

Se migra cada equipo físico conocido a `product_units` y se verifica que:

```text
products.stock == count(product_units where status in estados_disponibles)
```

### Etapa 3

El stock pasa a mantenerse mediante una única operación transaccional de inventario (trigger o servicio/RPC, según lo que arrojen las pruebas de concurrencia). La web continúa leyendo una proyección estable y no necesita saber cómo se calculó.

Nunca se implementará un `stock = stock - 1` suelto desde el LLM.

## 15. Venta transaccional objetivo

Una venta de una unidad inventariada debe ser atómica conceptualmente:

```text
1. validar actor
2. validar unidad disponible
3. crear/enlazar cliente
4. crear sales
5. crear sale_items snapshot
6. marcar unidad sold
7. registrar inventory_movement
8. registrar payment(s), si aplica
9. crear audit_event
10. devolver resultado
```

Si falla una parte crítica, no debe quedar una venta creada con una unidad todavía disponible para venderse otra vez.

Por eso esta operación deberá vivir en una transacción/RPC controlada o en una estrategia equivalente que garantice atomicidad; no como cinco inserts independientes generados por la IA.

## 16. Documentos y facturación

Se distinguen tres conceptos:

1. **Comprobante interno de venta:** capacidad actual basada en `sales` + PDF.
2. **Factura/recibo comercial no electrónico:** formato documental que puede evolucionar sobre el comprobante, sin afirmar validez DIAN electrónica.
3. **Factura electrónica DIAN:** futura integración separada con proveedor tecnológico/API y sus propios estados, CUFE, numeración autorizada y reglas tributarias.

El ERP no etiquetará el PDF actual como “factura electrónica”.

## 17. Estrategia de implementación

### Fase 0 — esta rama

- auditoría;
- arquitectura;
- contratos;
- propuestas de migración;
- cero cambios de producción.

### Fase 1A — identidad, cliente e inventario físico

- migración `customers`;
- migración `product_units`;
- `inventory_movements`;
- `audit_events`;
- repositorios;
- validación y tests.

### Fase 1B — ERP manual

- navegación del panel;
- clientes;
- inventario por unidad/serial;
- movimientos;
- recepción/ajuste.

### Fase 1C — ventas integradas

- enlazar ventas a cliente/unidad;
- consumo transaccional de inventario;
- pagos;
- mantener snapshot histórico.

### Fase 2 — API del agente

- identidad `wa_id` del administrador;
- service-to-service auth;
- tools de lectura;
- tools de escritura de riesgo A/B;
- auditoría y confirmaciones C.

### Fase 3 — multimedia

- imágenes por WhatsApp;
- pipeline de media;
- vinculación automática a producto/unidad;
- publicación web.

### Fase 4 — logística

- envíos;
- eventos;
- contraentrega;
- devoluciones.

### Fase 5 — garantías/compras/gastos/reportes

- garantía;
- proveedores;
- compras;
- costos;
- margen;
- reportes de operación.

### Fase 6 — automatización avanzada

- campañas;
- leads;
- órdenes administrativas compuestas;
- resúmenes automáticos;
- aprendizaje supervisado del agente.

## 18. Política staging → producción

Para cualquier migración ERP:

1. generar SQL versionado;
2. revisar compatibilidad con esquema actual;
3. probar en staging;
4. ejecutar pruebas de RLS;
5. ejecutar pruebas de concurrencia de operaciones críticas;
6. verificar rollback/recuperación;
7. validar manualmente el panel;
8. solo entonces considerar producción.

Ningún script de Fase 0 debe modificar producción automáticamente.

## 19. Primer hito funcional

El primer hito se considera terminado cuando todo esto funciona con la misma fuente de verdad:

- crear/buscar un cliente;
- recibir un computador físico con serial;
- ver esa unidad en inventario manual;
- registrar un movimiento de inventario;
- vender esa unidad desde el ERP;
- impedir una segunda venta de la misma unidad;
- actualizar la disponibilidad correspondiente;
- conservar el snapshot de venta;
- registrar auditoría;
- permitir al agente consultar esos mismos datos;
- permitir que un administrador WhatsApp autenticado ejecute al menos una operación segura de escritura usando una tool, no SQL libre.

## 20. Decisiones cerradas desde esta fase

1. Supabase es la única fuente de verdad.
2. No se duplica `products`.
3. No se duplica el módulo `sales` existente.
4. Las unidades físicas se modelan separadas del producto comercial.
5. Toda mutación de IA pasa por tools deterministas.
6. La identidad de administrador se deriva del transporte (`wa_id` validado), nunca del contenido del mensaje.
7. Las operaciones destructivas requieren confirmación fuerte.
8. El agente no recibe credenciales para SQL arbitrario.
9. Web manual y agente reutilizan la misma capa de dominio.
10. El comprobante PDF actual no se presentará como factura electrónica DIAN.
11. Toda ampliación se prueba en staging antes de producción.

## 21. Próximo artefacto

El siguiente paso de esta rama será diseñar la **Fase 1A** de manera ejecutable:

- migración propuesta para `customers`, `product_units`, `inventory_movements`, `audit_events`;
- invariantes y RLS;
- tipos TypeScript;
- repositorios;
- pruebas unitarias/integración;
- plan de compatibilidad con `products.stock` y `sales`.

Solo después de que ese núcleo esté probado se conectarán herramientas de escritura desde WhatsApp.
