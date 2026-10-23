# Piloto local: datos preparados y recorrido por estación

Este piloto usa exclusivamente Docker, Auth y Storage sintéticos locales. No corresponde al inventario real ni al hosting de producción. No envía WhatsApp, no realiza cobros y no emite facturas oficiales.

## Material ya preparado

`npm run pilot:seed` se ejecutó correctamente: cuatro cuentas de roles administrador/técnico/vendedor/caja, cuatro ubicaciones PILOT, tres QR libres, producto oculto a 700.000 COP y dos RAM sueltas funcionales de 4 GB DDR3 SO-DIMM con costo sintético de 30.000 cada una. Ejecutarlo nuevamente preserva el piloto existente; no repone ni reinicializa piezas consumidas.

Archivos privados, excluidos de Git:

- `.operational-pilot/credentials.json`: cuentas y contraseñas exclusivamente de prueba. Consultarlo localmente; no copiar sus valores a documentación ni logs.
- `.operational-pilot/state.json`: producto, ubicaciones, QR y piezas preparados.
- `.operational-pilot/labels.html`: tres QR SVG imprimibles con código legible; abrir en el navegador e imprimir al 100 %. No son etiquetas de inventario real.

Las migraciones 010000–080000 están aplicadas a `erp_test` y `erp_browser` locales. Para un banco nuevo seguir [verificación](verificacion-local.md) y [activación](operacion-activacion.md); el inicializador no acepta sobrescribir un contenedor existente.

## Abrir en el computador

Desde este repositorio, iniciar Docker/servicios locales conservados con `npm run test:operational:services`. No crear ni borrar volúmenes si ya existen. Con el puerto 3100 libre:

```bash
npm run test:operational:build
npm run test:operational:app -- start
```

Abrir `http://127.0.0.1:3100/admin/login`, usar la cuenta piloto y `/admin/taller`. Este build contiene direcciones locales y **nunca debe desplegarse**. No ejecutar build/dev simultáneamente ni arrancar dos servidores sobre la misma `.next`.

## Conectar un celular físico sin depender de localhost del teléfono

El teléfono debe acceder al computador por la misma red, usando HTTPS con certificado confiable. Se entrega `pilot:build` + `pilot:start`, proxy de Auth/REST/Storage en el mismo origen: el celular no intenta conectarse a su propio 127.0.0.1. Sólo admite localhost o una IP privada IPv4. No usa credenciales remotas.

1. Obtener del administrador de la red un certificado con SAN para la IP privada del computador y su CA; instalar la CA de prueba como confiable en los dispositivos del piloto. No se instaló ninguna CA ni se cambió la confianza de sus equipos desde esta implementación.
2. Detener el servidor local anterior. En una terminal dedicada configurar las rutas, sin pegar claves privadas en comandos o logs:

```bash
export ERP_PILOT_ORIGIN=https://192.168.1.50:3443
export ERP_PILOT_TLS_CERT=/ruta/privada/certificado.pem
export ERP_PILOT_TLS_KEY=/ruta/privada/clave.pem
export NODE_EXTRA_CA_CERTS=/ruta/privada/ca.pem
npm run pilot:build
npm run pilot:start
```

3. Sustituir la IP por la del computador y permitir únicamente desde la red del piloto el puerto 3443. Auth/REST/Storage y PostgreSQL siguen en loopback; no exponerlos en la red.
4. Abrir el mismo origen HTTPS en computador y celular. Debe aparecer como conexión confiable; una excepción manual de certificado no garantiza cámara. El proxy no sustituye el certificado ni desactiva validación TLS.

El proxy HTTPS se **ejecutó y verificó en localhost**, con certificado temporal confiado sólo por los procesos de prueba: login Auth, consulta REST, Storage y API servidor correctos (`scripts/operational/prove-pilot-https.mjs`, log `/tmp/sistetecni-pilot-https-proof.log`). No se instaló confianza en el sistema. El certificado de su IP, confianza, red y cámara físicos requieren sus dispositivos; Android/iOS no están verificados. No utilizar estos builds sintéticos para publicar el ERP.

## Recorrido y resultado a comprobar

Registrar las observaciones por código de unidad; no usar clientes ni cédulas reales. Una sola unidad conserva su STU desde recepción a envío.

| Paso / estación | Acción concreta | Resultado esperado |
| --- | --- | --- |
| Administrador | Entrar con cuenta piloto, revisar ubicaciones PILOT y controles obligatorios del taller. Abrir el HTML de etiquetas e imprimir. | Tres etiquetas limpias; QR sólo contiene código. Con sesión cerrada no abre datos del ERP. |
| Computador + celular | Misma cuenta técnica en ambos; en Taller abrir «Celular y estación», generar código en computador y canjearlo en celular en menos de cinco minutos. Mantener esas pestañas abiertas. | Conectado/sincronizado; otra pestaña no vinculada no sigue la selección. |
| Recepción | Leer un QR libre con cámara o ingreso manual. Marca/modelo ficticios, costo 200.000 sintético, ubicación PILOT-REC. Añadir una RAM 1 GB DDR3 SO-DIMM; no inventar datos de disco. Registrar recepción. | QR asignado, STU único, RAM actual 1 GB, original visible. Ambos dispositivos muestran esa unidad. Si ya se recibió en Compras, usar su STU en el campo opcional, sin crear otra unidad. |
| Evidencia | Tomar una foto desde el celular y guardarla. | Foto privada visible en computador tras refresco autorizado de hasta 15 s; otro usuario sin permiso no la obtiene. |
| Concurrencia | Dejar escrito un motivo sin guardar en computador; mover desde celular a PILOT-TEC. Intentar guardar la versión vieja en computador. | Conserva el borrador, informa conflicto y exige recargar/revisar. «Recargar ficha» con confirmación descarta el borrador y trae el servidor. No sobrescribe. |
| Técnica | Retirar RAM 1 GB, resultado funcional y destino PILOT-TEC. Instalar los dos repuestos 4 GB del piloto, uno por operación. | RAM actual 8 GB, original sigue 1 GB. Original suelta, dos piezas instaladas y ausentes de inventario suelto. Historial/costos sin duplicados. Las carreras de QR/última pieza están probadas automáticamente con dos conexiones; no simularlas borrando stock. |
| Instalación y pruebas | Registrar Windows/edición/versión y programas realmente autorizados; marcar instalado y probado por separado. Revisar pantalla, teclado, puertos, Wi-Fi, audio, disco y batería final según controles. | Driver Booster instalado no aprueba hardware. Intentar lista para venta antes de completar controles debe fallar. |
| Estética | Con administrador, buscar el producto PILOTO de `state.json`; crear Gris 3D y Gris chinas por separado, subir fotos distintas. Asociar/validar configuración final y precio 700.000. | Nombre/textura/fotos distintos, borrador generado desde la unidad. Completar controles y pasar a lista para venta. |
| Catálogo | Para comprobar dos opciones, registrar una **segunda** unidad con otro QR y su configuración real, asociarla al segundo acabado y completar controles; publicar únicamente el producto piloto. | Selector y fotos por acabado, stock y configuración de cada unidad. Preparación/reserva/vendido no disponibles. Un solo equipo no demuestra existencias de dos acabados. |
| Ventas | Cuenta vendedor: vender una unidad piloto por 700.000, transferencia pendiente sin cobros previos. | Una venta existente con unidad y snapshot; comprobante interno, sin factura oficial. |
| Envíos web | Crear desde esa venta, destinatario ficticio, oficina/dirección ficticia, Interrapidísimo. Guía `000PILOTO…`, flete 30.000, asumido por Sistetecni, descontado del recaudo, sin otros conceptos y confirmado. Despachar. | Guía conserva ceros. Venta 700.000; neto previsto 670.000. La guía todavía no produce caja. |
| Entrega | Registrar fecha servidor/Bogotá, responsable y referencia ficticia; confirmar neto 670.000. | Un costo transporte 30.000, entrega separada de cobro. Recordatorio nunca marca entrega. |
| Conciliación | Cuenta caja: buscar 670.000. Revisar guías y seleccionar explícitamente, cuenta/ref ficticias únicas, confirmar consignación. Repetir la misma petición desde la prueba automatizada, no crear otra referencia manual. | Una entrada 670.000, costo 30.000 una vez, venta conserva 700.000, saldo 0. Ninguna salida de caja por retención. |
| Diferencia / devolución | Usar otra venta/envío ficticios. Liquidación final distinta queda pendiente sin gasto automático. Ante devolución registrar transporte causado y motivo. | La devolución no vuelve disponible ni devuelve dinero automáticamente. Los costos de retorno pueden existir sin entrega exitosa. |
| Bot | Ejecutar `npm run test:operational:crossrepo` con servidor local compilado. | Formularios reales del bot aislado llaman HTTP/HMAC y BD local; ningún mensaje externo. Una prueba en su número real requiere activar Meta, plantilla y operador, fuera de este piloto sin autorización. |
| Asistencia | Cuenta técnica: abrir cámara/selfie, entrada, almuerzo/inicio-fin y salida. Administrador: revisar turno, corrección con motivo si hubo olvido, liquidar/aprobar. | Hora del servidor, sin turnos superpuestos; tarifa snapshot 10.000/h, almuerzo descontado. Es cálculo operativo, no nómina legal. |
| Retención | Ejecutar la suite E2E para vencimiento/borrado de evidencia sintética o esperar el día de retención del piloto y ejecutar el job local autorizado. | Referencia/metadatos conservados, archivo realmente ausente. No cambiar fechas de fotos reales para acelerar pruebas. |
| Cierre | Revocar vínculo, revisar historial y resultados, desactivar publicación piloto si deja de usarse. | Datos e historial conservados; no borrar movimientos financieros ni componentes para reiniciar el recorrido. |

## Comprobaciones que requieren sus dispositivos

Impresión/tamaño/adhesivo del QR; enfoque/lectura y permisos de cámara Android/iOS; compatibilidad `BarcodeDetector` (si falta, ingreso manual); selfie utilizable bajo iluminación del taller; certificado confiable en ambas máquinas; reconexión al apagar y volver a activar Wi-Fi; foto móvil real visible en escritorio; expiración/revocación sin otras pestañas suscritas; facilidad de uso con guantes/pantallas reales. Registrar navegador, versión y resultado. Las pruebas actuales usan Chromium y cámara sintética, con APIs y archivos persistidos reales locales.

El banco y el piloto no reemplazan el respaldo ni los controles de activación del destino: [orden, respaldo y recuperación](operacion-activacion.md), [jobs](jobs-operativos.md), [matriz completa](16-matriz-requisitos-operativos.md).
