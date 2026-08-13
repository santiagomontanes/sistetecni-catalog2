# Fase 2B/B5 — Guía de prueba manual del wizard "Personaliza tu portátil"

## Preparación

```bash
npm run env:staging   # asegura NEXT_PUBLIC_APP_ENV=staging en .env.local
npm run dev
```

Abre `http://localhost:3000/personalizar`.

Los 7 productos `[SEED]` deben estar cargados en STAGING (`npm run seed:staging`, ya hecho en B1). Todo lo que sigue usa exclusivamente esos 7 productos — no hace falta ningún dato adicional.

## Recordatorio de los 7 [SEED] (para interpretar resultados)

| # | Producto | RAM/Storage | Precio base | CPU gen | GPU | Touch | Stock |
|---|---|---|---|---|---|---|---|
| 1 | Dell Latitude 5490 | 16GB/512GB | $750.000 | 8 | integrada | no | 3 |
| 2 | Lenovo ThinkPad T480 | 8GB/256GB | $620.000 | 8 | integrada | no | 2 |
| 3 | HP EliteBook 840 G5 | 16GB/128GB | $680.000 | 8 | integrada | no | 4 |
| 4 | Dell Latitude 5491 | 8GB/128GB | $640.000 | 8 | integrada | no | 5 |
| 5 | Acer TravelMate B118 | 4GB/128GB (soldado) | $480.000 | ? (desconocida) | integrada | no | 6 |
| 6 | Lenovo ThinkPad T14 | 16GB/512GB | $980.000 | 10 | integrada | no | **0 (agotado)** |
| 7 | Dell XPS 13 9310 | 16GB/512GB | $2.500.000 | 11 | **dedicada** | **sí** | 2 |

## Flujo A — "Ayúdame a elegir"

1. En `/personalizar`, clic en **"Ayúdame a elegir"**.
2. Paso "¿Para qué lo necesitas?": elige **Programación** (preset: RAM≥16, storage≥256, cpuGen≥8, gpu cualquiera).
3. Paso presupuesto: ingresa `800000`. Verifica que se muestre el formato `$800.000` debajo del input.
4. Paso preferencia: elige **Sin preferencia**.
5. **Verificar en Resultados**:
   - P1 debe aparecer en "Disponibles" como *"Cumple tal como está"* (DIRECT_MATCH), sin upgrades, precio $750.000, badge "Dentro de tu presupuesto".
   - P3 debe aparecer con mejora de almacenamiento (STORAGE_UPGRADE_MATCH).
   - P4 debe aparecer con mejora de RAM (RAM_UPGRADE_MATCH) — storage ya cumple con 256 mínimo… en realidad P4 tiene 128GB, así que debería pedir ambos upgrades si storageMin=256; confírmalo en pantalla, no asumas.
   - P5 (Acer, sin CPU gen confirmada) **NO debe aparecer** en ningún lado — el requisito cpuGenerationMin=8 lo descarta por dato desconocido.
   - P6 (agotado) **NO debe aparecer** en "Disponibles" — debe estar en "Referencia / agotados" con badge "Actualmente agotado".
   - P2 (8GB RAM, upgradeable a 16 o 32) debe aparecer con RAM_UPGRADE_MATCH.
6. Clic en **"Ver configuración"** sobre P1. Verifica:
   - Sección "Portátil base" muestra CPU, RAM original (16), almacenamiento original (512 GB SSD), pantalla, gráfica.
   - Sección "Tu configuración" muestra lo mismo (sin upgrades) y el texto "Sin cambios — ya cumple lo que buscas."
   - Precio estimado `$750.000` visible como dato principal; "Ver desglose" muestra solo la fila "Equipo base".
7. Clic en **"Solicitar cotización"**. Ingresa ciudad `Bogotá` (opcional). Clic en **"Solicitar cotización"** del formulario.
8. **Verificar pantalla de éxito**: código con formato `COT-XXXXXXXXX` (9 caracteres tras el guion), resumen del producto, precio, "Válida hasta el [fecha +7 días]".
9. Clic en **"Continuar por WhatsApp"** — debe abrir `wa.me` con un mensaje que incluya el código exacto mostrado en pantalla.
10. Clic en **"Personalizar otro equipo"** — debe volver a la pantalla de inicio, todo el estado reseteado.

## Flujo B — "Personalizar características"

1. Desde `/personalizar`, clic en **"Personalizar características"**.
2. Completa: presupuesto `3000000`, RAM `16 GB`, almacenamiento `500 GB`, generación `Cualquiera`, GPU **Dedicada**, táctil **Sí**.
3. Clic en **"Buscar opciones"**.
4. **Verificar**: solo P7 (Dell XPS, la única con GPU dedicada + touch) debe aparecer, con budgetStatus probablemente "OVER_BUDGET" o "WITHIN_TOLERANCE" según el presupuesto exacto — confirma que el badge correspondiente se muestra (nunca oculto).
5. Vuelve atrás (botón "←") una vez — debes regresar al formulario con los valores por defecto (se pierden al volver, comportamiento esperado en esta primera versión).

## Flujo C — Cotización especial

1. Flujo "Personalizar": presupuesto `500000`, RAM `64 GB`, almacenamiento `2 TB`, resto "Cualquiera".
2. Buscar opciones. **Verificar**: pantalla "No encontramos exactamente esa configuración", resumen de presupuesto/RAM/almacenamiento, botón "Solicitar cotización especial".
3. Clic en el botón. Completa ciudad (opcional) y envía.
4. **Verificar**: pantalla de éxito sin sección de producto, mensaje "Cotización especial — te contactaremos...", sin precio mostrado, código presente.

## Flujo D — Selección invalidada por el servidor (opcional, requiere edición manual de STAGING)

Este caso ya está cubierto por un test de integración automatizado (B4) y no es necesario reproducirlo a mano salvo que quieras verificarlo visualmente: cambiar manualmente `visible_web=false` en un producto candidato entre el paso de resultados y el de cotización debería, al enviar, mostrar el banner ámbar "Esa opción ya no está disponible..." y refrescar resultados automáticamente — nunca crear la cotización con el dato viejo.

## Cosas a revisar en cada paso

- **Botón "Atrás"**: presente y funcional en cada paso salvo landing y la pantalla de éxito.
- **Barra de progreso**: avanza paso a paso, nunca retrocede sola.
- **Mobile**: reduce el ancho del navegador a ~360px (o usa las devtools en modo responsive) — ningún texto debe cortarse, los botones deben ser grandes y tocables.
- **Imágenes**: los 7 `[SEED]` no tienen fotos — cada tarjeta debe mostrar `/placeholder.jpg`, nunca un ícono roto.
- **Honeypot**: inspecciona el DOM en el paso de cotización — debe existir un input oculto `name="companyWebsite"` fuera de la vista, nunca visible ni con foco por teclado (tab no debería detenerse en él).

## Prueba de la API pública (curl, sin navegador)

```bash
# Código con formato inválido -> 400
curl -i http://localhost:3000/api/cotizaciones/no-valido

# Código bien formado pero inexistente -> 404
curl -i http://localhost:3000/api/cotizaciones/COT-ZZZZZZZZZ

# Código real de una cotización recién creada en el Flujo A -> 200
curl -i http://localhost:3000/api/cotizaciones/COT-XXXXXXXXX
```

Estas 3 verificaciones (400/404/200) ya se ejecutaron durante el desarrollo de B5 contra STAGING real — ver el entregable final para el detalle. La ruta 410 (expirada) también se verificó en vivo con una fila de prueba creada y borrada exclusivamente para esa comprobación.
