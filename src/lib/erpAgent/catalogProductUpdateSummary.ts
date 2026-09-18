/**
 * P20.20E/P20.20G — formateador PURO del preview de edición de publicación.
 *
 * `currentTitle` / `currentCpu` / `currentCondition` / `currentDescription`
 * vienen de una lectura REAL de public.products realizada por service.ts.
 *
 * `arguments.title` / `arguments.cpu` / `arguments.condition` /
 * `arguments.description` se muestran EXACTAMENTE como llegaron: este
 * helper no hace trim, lowercase, normalización ni correcciones.
 *
 * `description` es la clave de API (inglés); la columna real es
 * `public.products.descripcion` — el mapeo ya ocurrió en service.ts, este
 * formateador solo conoce el nombre de API.
 */
export function catalogProductUpdateConfirmationSummary({
  productId,
  currentTitle,
  currentCpu,
  currentCondition,
  currentDescription,
  arguments: args,
}: {
  productId: string;
  currentTitle: string;
  currentCpu: string;
  currentCondition?: string | null;
  currentDescription?: string | null;
  arguments: Record<string, unknown>;
}): string {
  const cambiaTitulo =
    Object.prototype.hasOwnProperty.call(args, "title");

  const cambiaCpu =
    Object.prototype.hasOwnProperty.call(args, "cpu");

  const cambiaCondicion =
    Object.prototype.hasOwnProperty.call(args, "condition");

  const cambiaDescripcion =
    Object.prototype.hasOwnProperty.call(args, "description");

  const nuevoTitulo =
    typeof args.title === "string" ? args.title : "";

  const nuevoCpu =
    typeof args.cpu === "string" ? args.cpu : "";

  const nuevaCondicion =
    typeof args.condition === "string" ? args.condition : "";

  const nuevaDescripcion =
    typeof args.description === "string" ? args.description : "";

  const lineas = [
    "📝 EDITAR PUBLICACIÓN",
    "",
    `Producto: ${currentTitle || productId || "producto"}`,
  ];

  if (cambiaTitulo) {
    lineas.push(
      "",
      "Nombre:",
      `Antes: ${currentTitle || "(sin nombre)"}`,
      `Después: ${nuevoTitulo}`,
    );
  }

  if (cambiaCpu) {
    lineas.push(
      "",
      "Procesador:",
      `Antes: ${currentCpu || "(sin especificar)"}`,
      `Después: ${nuevoCpu}`,
    );
  }

  if (cambiaCondicion) {
    lineas.push(
      "",
      "Condición:",
      `Antes: ${currentCondition || "(sin condición)"}`,
      `Después: ${nuevaCondicion}`,
    );
  }

  if (cambiaDescripcion) {
    lineas.push(
      "",
      "Descripción:",
      `Antes: ${currentDescription || "(sin descripción)"}`,
      `Después: ${nuevaDescripcion}`,
    );
  }

  return lineas.join("\n");
}
