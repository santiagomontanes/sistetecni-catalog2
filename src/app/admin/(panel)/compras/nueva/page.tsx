import { redirect } from "next/navigation";

// Los equipos ya no se reciben por lote de compra: cada uno se revisa y se recibe en Taller y recepción.
export default function NuevaCompraRedirect() {
  redirect("/admin/taller");
}
