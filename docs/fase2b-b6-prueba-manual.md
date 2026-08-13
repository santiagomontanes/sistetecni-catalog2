# Fase 2B/B6 — Guía de prueba manual del panel admin

## Preparación

```bash
npm run env:staging
npm run dev
```

Inicia sesión en `http://localhost:3000/admin/login` con una cuenta que tenga `is_admin = true` en `profiles` (STAGING).

## 1. Upgrades — `/admin/upgrades`

1. Crea un upgrade de prueba: categoría RAM, etiqueta "32 GB RAM (prueba)", capacidad 32, precio extra 150000.
2. Verifica que aparece en la tabla con el precio formateado en COP.
3. Edita el precio a 160000 — confirma que la tabla se actualiza.
4. Desactívalo — el badge debe pasar a "Inactivo" y la fila debe seguir apareciendo en la lista (nunca desaparece — no hay DELETE).
5. Reactívalo.

## 2. Compatibilidad — `/admin/productos`

1. Entra a editar cualquiera de los 7 productos `[SEED]` (por ejemplo, ThinkPad T480).
2. Debajo del formulario debe aparecer la sección "Compatibilidad de upgrades", con:
   - "Características del equipo base" (CPU, RAM actual, almacenamiento actual, gráfica, táctil) — solo lectura aquí.
   - "Upgrades permitidos" — resumen de lo ya marcado.
   - Checklist editable de RAM y Almacenamiento.
3. Marca/desmarca un par de casillas y pulsa "Guardar compatibilidad". Verifica el mensaje de éxito.
4. Recarga la página y confirma que el estado marcado persiste.

## 3. Copiar compatibilidad (D3)

1. En la misma sección, usa "Copiar compatibilidad desde otro producto" y selecciona otro de los `[SEED]`.
2. Pulsa "Ver vista previa" — debe listar los upgrades del producto origen sin guardar nada todavía.
3. Pulsa "Confirmar copia" — debe reemplazar la compatibilidad del producto actual por la del origen.
4. Verifica que el producto ORIGEN no cambió (edítalo y revisa su propia compatibilidad).

## 4. Campos del personalizador en el producto

1. Edita un producto y completa/ajusta: generación de CPU, tarjeta gráfica, modelo de GPU, pantalla táctil, tamaño de pantalla, almacenamiento actual (GB).
2. Guarda y vuelve a entrar a editarlo — los valores deben mantenerse (se leen vía `getProductByIdAdmin`, no desde el listado liviano).
3. Deja un campo vacío (por ejemplo, generación de CPU) — debe guardarse como "no confirmado" (null), nunca un valor inventado.

## 5. Cotizaciones — `/admin/cotizaciones`

1. Si ya generaste alguna cotización real durante la prueba manual de B5 (`/personalizar`), debe aparecer en el listado, más reciente primero.
2. Prueba los filtros de estado (nueva, contactada, en revisión, cotizada, aceptada, rechazada, expirada).
3. Busca por un fragmento del código — debe filtrar correctamente.
4. Abre el detalle de una cotización — confirma que muestra: código, fecha, expiración, ciudad, requisitos solicitados, producto base y configuración (o "cotización especial" si no tiene producto), upgrades, precio base y estimado.
5. Cambia el estado desde el selector — confirma que el cambio se refleja de inmediato y que solo aparecen los 7 estados aprobados en la lista desplegable.
6. Si `expires_at` ya pasó y el estado no es aceptada/rechazada/expirada, debe verse el badge "Expirada".

## 6. Snapshot histórico (verificación visual de puntos 12-13)

1. Anota el precio estimado de una cotización ya creada.
2. Ve a `/admin/upgrades` y sube el precio de alguno de los upgrades que esa cotización usó.
3. Vuelve al detalle de la cotización — el precio mostrado debe seguir siendo el ORIGINAL, sin cambios.
4. (Ya verificado automáticamente contra STAGING real durante el desarrollo de B6 — ver el entregable final, puntos G y H.)

## 7. Seguridad

1. Cierra sesión y visita `/admin/upgrades` directamente — debe redirigir a `/admin/login` (mismo comportamiento que el resto del panel, vía `ProtectedAdmin`).
2. (Verificado automáticamente: `requireAdmin()` rechaza cualquier token inválido/expirado o usuario sin `is_admin=true` — 7 tests unitarios en `src/lib/personalizadorAdmin/auth.test.ts`.)

## 8. Responsive

Reduce el ancho del navegador a un tamaño de tablet (~768px) y confirma que las tablas de Upgrades/Cotizaciones siguen siendo usables (scroll horizontal si hace falta, sin overflow roto).
