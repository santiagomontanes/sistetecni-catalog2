import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Eliminación de datos",
  description:
    "Cómo solicitar a SISTETECNI la eliminación de los datos personales asociados a tu interacción por WhatsApp o a una solicitud de cotización.",
  alternates: { canonical: "/eliminacion-de-datos" },
};

const ACTUALIZADA = "15 de agosto de 2026";
const CORREO = "sistetecnioficial@gmail.com";

export default function EliminacionDeDatosPage() {
  return (
    <article className="mx-auto max-w-3xl">
      <header className="border-b border-border pb-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">
          Documento legal
        </p>
        <h1 className="mt-2 text-3xl font-bold leading-tight text-text sm:text-4xl">
          Eliminación de datos
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Si has interactuado con SISTETECNI por WhatsApp o has creado una
          solicitud de cotización en nuestro sitio y deseas que eliminemos los
          datos personales asociados a esa interacción, aquí te explicamos cómo
          pedirlo.
        </p>
        <p className="mt-3 text-xs text-muted">
          Última actualización: {ACTUALIZADA}
        </p>
      </header>

      <div className="mt-10 space-y-10 text-sm leading-relaxed text-text">
        {/* 1 */}
        <section>
          <h2 className="text-lg font-semibold text-text">
            1. Cómo solicitarlo
          </h2>
          <p className="mt-3 text-muted">
            Envía un correo a la siguiente dirección con el asunto{" "}
            <span className="font-medium text-text">
              «Solicitud de eliminación de datos»
            </span>
            :
          </p>
          <div className="mt-4 rounded-2xl border border-border bg-surface p-6">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">
              Canal de solicitud
            </div>
            <a
              href={`mailto:${CORREO}?subject=Solicitud%20de%20eliminaci%C3%B3n%20de%20datos`}
              className="mt-1 block break-all text-lg font-semibold text-primary hover:underline"
            >
              {CORREO}
            </a>
          </div>
        </section>

        {/* 2 */}
        <section>
          <h2 className="text-lg font-semibold text-text">
            2. Qué información incluir
          </h2>
          <p className="mt-3 text-muted">
            Pedimos únicamente lo mínimo para poder localizar tu interacción:
          </p>
          <ul className="mt-3 space-y-2 text-muted">
            <li className="flex gap-3">
              <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
              <span>
                <span className="font-medium text-text">
                  El número de WhatsApp
                </span>{" "}
                desde el que nos escribiste, si tu solicitud tiene que ver con
                una conversación por ese canal.
              </span>
            </li>
            <li className="flex gap-3">
              <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
              <span>
                <span className="font-medium text-text">
                  El código de la cotización
                </span>{" "}
                (formato <span className="font-mono text-text">COT-XXXXXX</span>
                ), si tu solicitud tiene que ver con una cotización creada en el
                sitio web.
              </span>
            </li>
            <li className="flex gap-3">
              <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
              <span>
                <span className="font-medium text-text">
                  Una fecha aproximada
                </span>{" "}
                de la conversación o de la solicitud, si la recuerdas.
              </span>
            </li>
          </ul>
          <p className="mt-3 text-muted">
            No hace falta que envíes documentos de identidad, datos bancarios ni
            capturas completas de la conversación. Si en algún caso necesitamos
            confirmar de forma razonable que la solicitud proviene del titular
            —por ejemplo, pidiéndote que la envíes desde el mismo número de
            WhatsApp—, te lo indicaremos por el mismo medio.
          </p>
        </section>

        {/* 3 */}
        <section>
          <h2 className="text-lg font-semibold text-text">
            3. Qué se elimina
          </h2>
          <p className="mt-3 text-muted">
            Eliminamos los datos personales asociados a tu interacción que
            conservemos en nuestros sistemas en el momento de atender la
            solicitud. Conviene tener en cuenta cómo funciona nuestro servicio:
          </p>
          <ul className="mt-3 space-y-2 text-muted">
            <li className="flex gap-3">
              <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
              <span>
                El contexto de una conversación de WhatsApp vive solo en memoria
                y se descarta a los 30 minutos de inactividad, así que en la
                mayoría de los casos ya no existe cuando llega la solicitud.
              </span>
            </li>
            <li className="flex gap-3">
              <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
              <span>
                Las solicitudes de cotización sí se guardan en nuestra base de
                datos comercial y son el caso habitual de eliminación.
              </span>
            </li>
            <li className="flex gap-3">
              <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
              <span>
                El historial del chat guardado en tu propio teléfono y en la
                infraestructura de WhatsApp no está bajo nuestro control: no
                podemos borrarlo por ti.
              </span>
            </li>
          </ul>
          <p className="mt-3 text-muted">
            Puedes ver el detalle de qué datos tratamos y durante cuánto tiempo
            en nuestra{" "}
            <Link
              href="/politica-de-privacidad"
              className="font-medium text-primary hover:underline"
            >
              política de privacidad
            </Link>
            .
          </p>
        </section>

        {/* 4 */}
        <section>
          <h2 className="text-lg font-semibold text-text">
            4. Información que puede conservarse
          </h2>
          <p className="mt-3 text-muted">
            Puede haber información que debamos conservar aunque nos pidas
            eliminarla, cuando exista una obligación legal, contable o tributaria
            aplicable, o cuando sea necesaria para acreditar una operación
            comercial ya realizada (por ejemplo, la venta de un equipo y su
            garantía). En ese caso te lo explicaremos y limitaremos esa
            conservación a lo estrictamente necesario.
          </p>
          <p className="mt-3 text-muted">
            También pueden subsistir registros técnicos que no te identifican
            directamente, como identificadores internos de mensajes o
            identificadores seudónimos de sesión, descritos en la política de
            privacidad.
          </p>
        </section>

        {/* 5 */}
        <section>
          <h2 className="text-lg font-semibold text-text">
            5. Plazo de respuesta
          </h2>
          <p className="mt-3 text-muted">
            Atenderemos tu solicitud en el menor tiempo posible y dentro de los
            términos que fije la normativa aplicable. Te confirmaremos por correo
            electrónico cuando la eliminación se haya realizado o, si no procede
            en algún punto, cuál es la razón.
          </p>
        </section>

        <section className="rounded-2xl border border-border bg-surface p-6">
          <h2 className="text-base font-semibold text-text">Contacto</h2>
          <p className="mt-2 text-muted">
            Solicitudes y dudas:{" "}
            <a
              href={`mailto:${CORREO}`}
              className="font-medium text-primary hover:underline"
            >
              {CORREO}
            </a>
          </p>
          <p className="mt-1 text-muted">SISTETECNI · San Diego, Bogotá, Colombia</p>
        </section>
      </div>
    </article>
  );
}
