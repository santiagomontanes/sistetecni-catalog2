# Migraciones escritas y probadas, en espera de una decisión

Lo que hay aquí **no** lo aplica `supabase db push`: está fuera de
`supabase/migrations/` a propósito. Son arreglos verificados que tocan algo
suficientemente central como para que aplicarlos sea una decisión, no un
efecto secundario de desplegar otra cosa.

Para aplicar uno, muévelo a `supabase/migrations/` y haz `db push` como
siempre. Antes de eso, lee su cabecera: cada archivo explica qué defecto
corrige, cómo se midió y qué no cambia.

## `20261021210000_fix_stock_race.sql`

Añade un candado de fila (`for update`) a `erp_sync_product_stock` antes de
recontar el stock publicado.

**Por qué espera:** toca inventario central (Fase 1D). El defecto es
preexistente, no una regresión de P20.29.

**El defecto:** dos ventas simultáneas de unidades del mismo producto dejan
`products.stock = 1` con cero unidades `available`. El bot ofrece una unidad
que no existe. Reproducido dos veces en un Postgres aislado con transacciones
reales.

**Ojo con el orden de los triggers:** hoy el defecto está tapado por
accidente. El trigger de color de P20.29 (`product_units_sync_colors`) ordena
alfabéticamente antes que `product_units_sync_web_stock`, y su propio candado
serializa toda la cadena. Funciona, pero por casualidad: renombrar el trigger
de color devuelve el defecto. Por eso este arreglo vive en su propia función
en vez de depender de un nombre.
