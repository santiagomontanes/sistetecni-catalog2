/**
 * Página interna de resultado del onboarding. No indexable, sin secretos.
 *
 * Todo lo que se muestra viene de la query, así que TODO se sanea aquí otra vez
 * —aunque el callback ya lo hizo— porque a esta URL puede llegar cualquiera con
 * los parámetros que quiera. Nada de lo que se pinta puede venir crudo.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { onboardingHabilitado } from "@/lib/meta/env";
import { sanearCodigoInterno, sanearIdentificador } from "@/lib/meta/redactar";
import { NUMERO_OBJETIVO_E164, type Coincidencia, type EstadoCallback } from "@/lib/meta/callback";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Resultado del onboarding",
  robots: { index: false, follow: false },
};

type Query = Record<string, string | string[] | undefined>;

const primero = (v: string | string[] | undefined): string =>
  Array.isArray(v) ? (v[0] ?? "") : (v ?? "");

const ESTADOS: readonly EstadoCallback[] = ["ok", "error", "observacion"];
const COINCIDENCIAS: readonly Coincidencia[] = ["COINCIDE", "NO_COINCIDE", "DESCONOCIDO"];

/** Solo dígitos, "+" y el carácter de máscara. Nada más llega al HTML. */
const sanearTelefono = (v: string): string | null => {
  const limpio = v.replace(/[^0-9+·]/g, "").slice(0, 24);
  return limpio.length >= 4 ? limpio : null;
};

const sanearListaParams = (v: string): string[] =>
  v
    .split(",")
    .map((n) => n.replace(/[^a-z_0-9:]/gi, "").slice(0, 32))
    .filter(Boolean)
    .slice(0, 12);

export default async function ResultadoOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  // Con el kill switch apagado esta página tampoco existe.
  if (!onboardingHabilitado()) notFound();

  const sp = await searchParams;

  const estadoCrudo = primero(sp.estado) as EstadoCallback;
  const estado: EstadoCallback = ESTADOS.includes(estadoCrudo) ? estadoCrudo : "error";

  const codigo = sanearCodigoInterno(primero(sp.codigo));

  const coincidenciaCruda = primero(sp.coincide).toUpperCase() as Coincidencia;
  const coincide: Coincidencia = COINCIDENCIAS.includes(coincidenciaCruda)
    ? coincidenciaCruda
    : "DESCONOCIDO";

  const wabaId = sanearIdentificador(primero(sp.waba));
  const phoneNumberId = sanearIdentificador(primero(sp.numero));
  const telefono = sanearTelefono(primero(sp.tel));
  const parametros = sanearListaParams(primero(sp.params));
  const estadoState = sanearCodigoInterno(primero(sp.state)).toLowerCase();
  const token = primero(sp.token) === "valido" ? "válido" : primero(sp.token) === "invalido" ? "no válido" : null;

  const cabecera = {
    ok: { titulo: "Intercambio completado", clase: "text-success", nota: "El code se intercambió correctamente." },
    observacion: {
      titulo: "Callback recibido sin authorization code",
      clase: "text-primary",
      nota: "Meta llamó al redirect URI pero no envió ningún code. Es un resultado esperable: la documentación de Hosted ES no garantiza ese parámetro.",
    },
    error: { titulo: "El callback terminó en error", clase: "text-text", nota: "Revisa el código interno." },
  }[estado];

  const filas: Array<{ etiqueta: string; valor: string }> = [
    { etiqueta: "Estado", valor: estado },
    { etiqueta: "Código interno", valor: codigo },
    { etiqueta: "Parámetros recibidos", valor: parametros.length ? parametros.join(", ") : "ninguno" },
    { etiqueta: "state", valor: estadoState },
    { etiqueta: "WABA ID", valor: wabaId ?? "—" },
    { etiqueta: "Phone Number ID", valor: phoneNumberId ?? "—" },
    { etiqueta: "Número (enmascarado)", valor: telefono ?? "—" },
    { etiqueta: "Token inspeccionado", valor: token ?? "—" },
  ];

  return (
    <article className="mx-auto max-w-3xl">
      <header className="border-b border-border pb-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">
          Uso interno · no indexable
        </p>
        <h1 className={`mt-2 text-2xl font-bold leading-tight sm:text-3xl ${cabecera.clase}`}>
          {cabecera.titulo}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">{cabecera.nota}</p>
      </header>

      <section className="mt-8">
        <div
          className={`rounded-2xl border p-6 ${
            coincide === "COINCIDE"
              ? "border-success bg-surface"
              : coincide === "NO_COINCIDE"
                ? "border-primary bg-surface"
                : "border-border bg-surface"
          }`}
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">
            Verificación del número
          </div>
          <div className="mt-1 text-lg font-semibold text-text">{coincide}</div>
          <p className="mt-2 text-sm text-muted">
            {coincide === "COINCIDE"
              ? `La WABA incluye el número esperado (+${NUMERO_OBJETIVO_E164}).`
              : coincide === "NO_COINCIDE"
                ? `Ninguno de los números de esta WABA es el esperado (+${NUMERO_OBJETIVO_E164}). No continúes: no se ha suscrito ni modificado nada.`
                : "No hubo datos suficientes para comprobar el número."}
          </p>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-text">Detalle</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[30rem] border-collapse text-left text-sm">
            <tbody className="text-muted">
              {filas.map((f) => (
                <tr key={f.etiqueta} className="border-b border-border align-top">
                  <td className="w-56 py-3 pr-4 font-medium text-text">{f.etiqueta}</td>
                  <td className="py-3 font-mono break-all">{f.valor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8 rounded-2xl border border-border bg-surface p-6 text-sm text-muted">
        <h2 className="text-base font-semibold text-text">Qué NO se ha hecho</h2>
        <ul className="mt-3 space-y-2">
          <li>No se ha llamado a <span className="font-mono text-text">POST /&lt;WABA_ID&gt;/subscribed_apps</span>.</li>
          <li>No se ha guardado ningún token: existió solo en memoria durante la petición.</li>
          <li>No se ha escrito nada en Supabase ni se ha tocado el agente.</li>
        </ul>
      </section>
    </article>
  );
}
