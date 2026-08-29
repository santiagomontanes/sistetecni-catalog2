# SISTETECNI ERP — Fase 1B: panel de Clientes + Inventario físico

Estado: **implementado en rama `erp/fase0-core`; NO desplegado ni aplicado a producción**.

## Objetivo

Dar al administrador una interfaz visual para empezar a operar el ERP antes de conectar mutaciones por WhatsApp:

- crear y buscar clientes;
- ver inventario por máquina física;
- recibir computadores por serial;
- registrar costo y salud de componentes;
- registrar configuración real de una unidad;
- dejar movimiento y auditoría por cada recepción.

## Rutas nuevas

- `/admin/clientes`
- `/admin/inventario`
- `/admin/inventario/recibir`

El `AdminShell` muestra ahora **Clientes** e **Inventario** como módulos del ERP.

## Clientes

La pantalla permite crear un cliente con:

- nombre (obligatorio);
- tipo de documento;
- documento;
- celular;
- correo;
- dirección;
- ciudad;
- notas.

La operación de creación usa `erp_create_customer(...)`.

La función crea en una misma transacción:

1. `customers`;
2. `audit_events` con `operation = customer.create`.

No existe borrado duro de clientes en esta fase.

Las ventas existentes todavía NO tienen `customer_id`. Ese enlace se introduce en Fase 1C y las columnas snapshot de `sales` se conservarán para que un cambio posterior del cliente no altere comprobantes históricos.

## Inventario físico

`products` sigue representando el producto comercial/modelo.

`product_units` representa cada máquina física.

Ejemplo:

```text
Dell Latitude 7490 (products)
  ├─ STU-000001 · serial ABC123 · received
  ├─ STU-000002 · serial DEF456 · available
  └─ STU-000003 · serial GHI789 · repair
```

La pantalla `/admin/inventario` muestra:

- código ERP de unidad;
- serial;
- producto/modelo;
- estado;
- fecha de recepción;
- costo de adquisición;
- salud de batería;
- salud de almacenamiento;
- configuración física sobrescrita;
- `products.stock` actual solamente como referencia visual.

### Estados mostrados

- received → Recibido
- inspection → Inspección
- available → Disponible
- reserved → Reservado
- sold → Vendido
- warranty → Garantía
- repair → Reparación
- returned → Devuelto
- retired → Retirado

Fase 1B todavía no expone botones para transicionar manualmente estos estados. Eso se implementará con una operación transaccional explícita; no se hará `UPDATE status` libre desde el navegador.

## Recepción de computadores

La ruta `/admin/inventario/recibir` primero busca un producto existente del catálogo y después registra la unidad física.

Campos soportados:

- serial del fabricante;
- costo de adquisición COP;
- salud de batería 0–100%;
- salud de disco 0–100%;
- RAM real instalada;
- capacidad real de almacenamiento;
- tipo SSD/NVMe/HDD/eMMC/Otro;
- observaciones de estado físico;
- notas internas.

La operación usa `erp_receive_product_unit(...)`.

Dentro de una sola transacción PostgreSQL:

1. genera `STU-000001` mediante `product_unit_code_seq`;
2. crea `product_units` con estado `received`;
3. crea `inventory_movements` con `movement_type = receipt`;
4. crea `audit_events` con `operation = inventory.receive`.

Si cualquiera falla, toda la operación se revierte.

## Regla importante de stock

**Fase 1B NO modifica `products.stock`.**

Esto es deliberado.

Todavía existen productos del catálogo sin sus unidades históricas cargadas. Hacer ahora:

```text
products.stock = count(product_units where status='available')
```

podría llevar productos reales a stock cero.

Secuencia correcta:

1. crear estructura física;
2. cargar/migrar unidades;
3. verificar equivalencia;
4. implementar estados/transiciones;
5. activar proyección/sincronización de stock.

Hasta entonces `products.stock` continúa siendo la fuente usada por el catálogo web y el agente actual.

## Seguridad

Todas las Server Actions pasan primero por `requireAdmin(accessToken)`.

Las tablas ERP mantienen RLS admin-only.

Los RPC de Fase 1B son `SECURITY INVOKER`, de modo que las policies de RLS siguen aplicando al usuario que ejecuta la operación.

No se usa `service_role` en el navegador.

No se exponen las tablas ERP al público.

## Migraciones requeridas en STAGING

Orden:

1. `20260827183000_erp_core_fase1a.sql`
2. `20260827204500_erp_fase1b_admin_operations.sql`

Antes de producción se debe ejecutar el script de verificación de 1A y además comprobar manualmente los RPC de 1B.

## Prueba mínima de STAGING

1. entrar con admin;
2. abrir `/admin/clientes`;
3. crear cliente de prueba;
4. confirmar una fila en `customers`;
5. confirmar `audit_events.operation = customer.create`;
6. abrir `/admin/inventario/recibir`;
7. buscar producto real de staging;
8. recibir una unidad con serial de prueba;
9. confirmar código `STU-xxxxxx`;
10. confirmar una fila `product_units` status `received`;
11. confirmar un `inventory_movements` receipt;
12. confirmar un `audit_events` inventory.receive;
13. confirmar que `products.stock` NO cambió;
14. repetir el serial y verificar que la operación falle;
15. probar usuario no-admin y verificar FORBIDDEN/RLS.

## Pendiente para Fase 1C

- vincular opcionalmente `sales.customer_id`;
- vincular `sale_items.product_unit_id`;
- operación atómica de venta de unidad;
- bloquear doble venta del mismo serial;
- pagos múltiples/parciales;
- transición `available → reserved → sold`;
- actualización/proyección segura de stock;
- detalle individual de unidad y timeline de movimientos;
- conexión posterior con tools administrativas del agente.
