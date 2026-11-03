import { redirect } from "next/navigation";

// Todo equipo entra por Taller y recepción (con su QR/STU y su revisión). Se conserva la ruta para enlaces guardados.
export default function RecibirRedirect() {
  redirect("/admin/taller");
}
