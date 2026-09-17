/**
 * P20.20E — formateador PURO del preview de edición de publicación.
 *
 * `currentTitle` / `currentCpu` vienen de una lectura REAL de public.products
 * realizada por service.ts.
 *
 * `arguments.title` / `arguments.cpu` se muestran EXACTAMENTE como llegaron:
 * este helper no hace trim, lowercase, normalización ni correcciones.
 */
export function catalogProductUpdateConfirmationSummary({
  productId,
  currentTitle,
  currentCpu,
  arguments: args,
}: {
  productId: string;
  currentTitle: string;
  currentCpu: string;
  arguments: Record<string, unknown>;
}): string {
  const cambiaTitulo =
    Object.prototype.hasOwnProperty.call(args, "title");

  const cambiaCpu =
    Object.prototype.hasOwnProperty.call(args, "cpu");

  const nuevoTitulo =
    typeof args.title === "string" ? args.title : "";

  const nuevoCpu =
    typeof args.cpu === "string" ? args.cpu : "";

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

  return lineas.join("\n");
}
