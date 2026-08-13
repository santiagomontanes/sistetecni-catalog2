# Fase 2B/B7 — Guía de prueba manual consolidada

Guía única para probar de extremo a extremo lo construido en B5 (wizard público) y B6 (panel admin), ya con B7 verificado automáticamente contra STAGING (ver entregable final para el detalle de qué se probó ya en código).

## Preparación

```bash
npm run env:staging
npm run dev
```

Abre `http://localhost:3000`.

## Parte 1 — `/personalizar` (cliente)

### 1.1 Ayúdame a elegir

1. Entra a `/personalizar` → "Ayúdame a elegir".
2. Elige "Programación" → presupuesto `900000` → "Sin preferencia".
3. **Resultado esperado**: en "Disponibles" aparecen varios de los 7 `[SEED]`, cada uno con badge de presupuesto correcto y, si aplica, upgrades listados con su precio.
4. Repite eligiendo "Diseño" — el resultado debería excluir productos sin GPU dedicada (P1-P4, P6 tienen integrada) y priorizar P7 (Dell XPS, única con GPU dedicada), aunque probablemente aparezca marcado "sobre presupuesto" salvo que subas el presupuesto.

### 1.2 Personalizar

1. Vuelve a `/personalizar` → "Personalizar características".
2. Presupuesto `800000`, RAM `16 GB`, almacenamiento `500 GB`, resto "Cualquiera".
3. **Resultado esperado**: P1 (Dell Latitude 5490) aparece en "Disponibles" como "Cumple tal como está", precio `$750.000`.
4. Cambia RAM a `32 GB` — ahora ningún `[SEED]` debería cumplir directo; deberías ver upgrades ofrecidos o la pantalla de cotización especial si nada alcanza.

### 1.3 Cotización normal

1. Desde un resultado disponible, pulsa "Ver configuración" → revisa que "Portátil base" muestre los datos ORIGINALES (RAM/almacenamiento antes del upgrade) y "Tu configuración" los FINALES.
2. Pulsa "Solicitar cotización", deja ciudad opcional (ej. "Bogotá"), envía.
3. **Resultado esperado**: pantalla "¡Tu cotización está lista!" con código `COT-XXXXXXXXX` (9 caracteres), precio, vigencia de 7 días.
4. Copia el código.

### 1.4 Cotización especial

1. Vuelve a `/personalizar` → "Personalizar" → pide algo imposible (ej. RAM `64 GB`, almacenamiento `2 TB`... nota: el selector no llega a esos valores en el formulario actual — usa en su lugar `cpuGenerationMin` alto vía "Ayúdame a elegir" no lo expone; la forma más simple de forzar cotización especial manualmente es pedir GPU dedicada + táctil sí + presupuesto muy bajo, o simplemente confiar en que ya quedó demostrado automáticamente en el entregable — ver caso B8 del reporte).
2. Si llegas a la pantalla "No encontramos exactamente esa configuración", pulsa "Solicitar cotización especial" y confirma que se genera un código igual, sin producto ni precio.

### 1.5 Botón de WhatsApp

1. En la pantalla de éxito, pulsa "Continuar por WhatsApp".
2. **Resultado esperado**: abre WhatsApp Web/App con un mensaje que incluye tu código de cotización exacto.

## Parte 2 — `/admin` (administrador)

Inicia sesión con una cuenta `is_admin=true`.

### 2.1 `/admin/upgrades`

1. Crea un upgrade de prueba (RAM, 32 GB, $150.000).
2. Edítalo a $160.000 — verifica que se actualiza.
3. Desactívalo y actívalo — nunca debe desaparecer de la lista.

### 2.2 `/admin/productos` — compatibilidad

1. Edita el ThinkPad T480 (`[SEED]`).
2. En "Compatibilidad de upgrades", verifica que "Características del equipo base" muestra los datos reales (RAM 8, etc.) — no editables ahí.
3. Marca/desmarca upgrades y guarda.
4. Prueba "Copiar compatibilidad desde otro producto" con vista previa antes de confirmar.

### 2.3 `/admin/cotizaciones`

1. Busca el código que generaste en el paso 1.3 — debería aparecer.
2. Ábrelo — confirma que el precio/config mostrados son EXACTAMENTE los que viste al crearla (snapshot, nunca recalculado).
3. Cambia su estado a "Contactada" — confirma el cambio inmediato.
4. Prueba los filtros de estado y la búsqueda por código.

## Qué NO hace falta repetir manualmente

Ya verificado automáticamente contra STAGING real como parte del entregable de B7 (22 tests end-to-end + 15 de seguridad/RLS, todos con datos `[TEST-B7]` limpiados por id exacto):
- Los 7 usos de "Ayúdame a elegir" y los 8 escenarios de "Personalizar" (incluida cotización especial).
- Crear/consultar cotización normal y especial, código expirado/inexistente/inválido.
- Flujo admin completo (crear upgrade → compatibilidad → copiar → búsqueda lo encuentra → cotización → listado → detalle → cambio de estado).
- Manipulación de precio/upgrade/producto desde el cliente (ignorada), honeypot (bloquea), RLS (anon no puede leer `quote_requests` ni escribir en ninguna tabla protegida).

Ver el entregable final de B7 para el detalle exacto de cada verificación automática.
