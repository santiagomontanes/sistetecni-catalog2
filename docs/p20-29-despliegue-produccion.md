# P20.29 — aplicar el color en PRODUCCIÓN

Procedimiento exacto. Cada comando dice qué hace y qué debe devolver.

---

## 0. Lo que se verificó antes de escribir esto

| Qué | Resultado |
|---|---|
| Proyecto de producción | `fxbtubhhevbigflsyvqz` (`sistetecni-catalog`, us-east-1, ACTIVE_HEALTHY) |
| Proyecto de staging | `gwvjubkjdkpadetypzrj` (`SISTETECNI-staging`, us-west-2, **INACTIVE**) |
| A qué está enlazado el CLI | **staging** |
| Migraciones aplicadas en producción | 43, la última `20260922000000` |
| Migraciones locales | 45 |
| **Pendientes en producción** | **exactamente 2**, las dos de P20.29 |

Las pendientes, nada más:

- `20261021200000_p2029_color_producto.sql`
- `20261021220000_p2029_color_en_product_update.sql`

`20261021210000_fix_stock_race.sql` **no** está en esa ruta: vive en
`supabase/migraciones-en-espera/` a propósito, para que esto no lo aplique de
rebote. Sigue pendiente de tu decisión.

### Por qué NO se usa `supabase db push`

Dos razones, las dos comprobadas:

1. **El CLI está enlazado a staging**, que además está pausado. Un `db push`
   sin más habría ido al proyecto equivocado.
2. **El host directo de la base solo resuelve IPv6**
   (`db.fxbtubhhevbigflsyvqz.supabase.co` → `2600:1f18:…`) y esta máquina no
   tiene ruta IPv6. La conexión directa es imposible aquí, con contraseña o sin
   ella — por eso falló el intento anterior.

Se usa `supabase db query --linked --project-ref <producción>`, que va por la
**Management API**: apunta a producción de forma explícita, no necesita tu
contraseña de Postgres y no necesita IPv6.

### Ensayo previo

La función `erp_agent_dispatch` de producción se descargó entera (42 941
caracteres) y las dos migraciones se aplicaron sobre **esa misma función** en
un Postgres aislado. Resultado:

- las 7 anclas del parche casan **exactamente una vez** en la función real;
- las 43 acciones del dispatch siguen presentes tras el parche;
- las 6 validaciones preexistentes de `catalog.product.update` siguen;
- editar solo el color cambia solo el color (precio y stock intactos);
- `colores_disponibles` se rechaza con `catalog_product_update_unknown_fields`;
- `color: null` lo deja sin especificar.

---

## 1. Respaldo (ya hecho, nada que ejecutar)

| Qué | Dónde |
|---|---|
| Definición previa de `erp_agent_dispatch` | `~/respaldos-p2029/dispatch-prod-20261022-085853.sql` |
| Estado de los 9 productos (id, precio, stock, visible, md5 de la descripción) | `~/respaldos-p2029/products-antes-20261022-085853.json` |

---

## 2. Aplicar — comandos exactos, en orden

Todos desde `~/proyectos/sistetecni-catalog2`.

### 2.1 Primera migración: columnas, funciones, triggers y relleno inicial

```
supabase db query --linked --project-ref fxbtubhhevbigflsyvqz --file supabase/migrations/20261021200000_p2029_color_producto.sql
```

Añade `products.color` y `products.colores_disponibles`, las funciones
`erp_unit_color` y `erp_sync_product_colors`, los dos triggers, y rellena
`colores_disponibles` de los productos que ya existen.

Es aditiva: no borra ni modifica ninguna columna existente, y la única
escritura de datos es poblar la columna nueva.

### 2.2 Segunda migración: que se pueda EDITAR el color

```
supabase db query --linked --project-ref fxbtubhhevbigflsyvqz --file supabase/migrations/20261021220000_p2029_color_en_product_update.sql
```

Mete `color` en la lista blanca de `catalog.product.update` dentro de
`erp_agent_dispatch`. Debe imprimir dos avisos:

```
NOTICE:  P20.29: catalog.product.update ahora acepta color
NOTICE:  P20.29 verify OK: color editable, colores_disponibles protegido, resto intacto
```

Si en vez de eso sale `P20_29_ancla_N_con_M_ocurrencias`, **para**: significa
que la función cambió desde el ensayo. No reintentes; avísame.

### 2.3 Registrar las dos en el historial

```
supabase db query --linked --project-ref fxbtubhhevbigflsyvqz --file supabase/verificacion/p2029-registrar.sql
```

`db query` ejecuta el SQL pero no anota nada en `schema_migrations`. Sin esto,
un futuro `db push` intentaría aplicarlas otra vez.

---

## 3. Comprobación posterior

```
supabase db query --linked --project-ref fxbtubhhevbigflsyvqz --file supabase/verificacion/p2029-verificar.sql
```

14 comprobaciones. **Las 14 deben decir `OK`.** La última fila es informativa:
cuántos productos tienen ya algún color disponible (con los colores sin
escribir todavía, lo normal es `0 de 9`).

---

## 4. Reiniciar el agente

El código de P20.29 ya está fusionado en `deploy/p20-28-production`, pero el
proceso sigue ejecutando la versión anterior. Requiere sudo:

```
sudo systemctl restart sistetecni-agente.service
```

Luego, sin sudo:

```
systemctl is-active sistetecni-agente.service
curl -s http://127.0.0.1:8080/health | python3 -m json.tool | head -20
```

En `/health` debe aparecer la clave **`formulariosAdminVigentes`** dentro de
`erp`. Si no está, el proceso sigue con el código viejo.

---

## 5. Si algo sale mal

| Problema | Qué hacer |
|---|---|
| Falla 2.2 con `P20_29_ancla_…` | Nada más. La 2.1 es inocua por sí sola. Avísame. |
| El dispatch quedó raro | Restaurar `~/respaldos-p2029/dispatch-prod-20261022-085853.sql` (es la definición exacta previa) |
| Deshacer el color en la base | `supabase/verificacion/p2029-revertir.sql` — quita triggers y funciones, deja las columnas (borrarlas destruiría el color ya escrito) |
| El agente falla tras reiniciar | `git revert b90c019` + reiniciar. O `ERP_ADMIN_MENU_ACTIVO=false` en `.env` + reiniciar, que apaga solo el menú |
| El web | Rollback instantáneo en Vercel al despliegue anterior |

**El orden entre migración y reinicio no importa.** Los tres puntos que
habrían fallado (consultas del agente, catálogo PDF, guardar un producto)
degradan solos ante `42703` si el mensaje habla del color. Verificado contra
el error real de producción: con el web ya desplegado y sin la migración, el
catálogo PDF se generó correctamente (1,5 MB).
