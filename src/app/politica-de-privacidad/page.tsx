import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description:
    "Cómo SISTETECNI trata los datos personales de quienes escriben por WhatsApp o solicitan una cotización en sistetecni.com: qué datos se reciben, para qué se usan, cuánto se conservan y cómo ejercer tus derechos.",
  alternates: { canonical: "/politica-de-privacidad" },
};

const ACTUALIZADA = "15 de agosto de 2026";
const CORREO = "sistetecnioficial@gmail.com";

export default function PoliticaDePrivacidadPage() {
  return (
    <article className="mx-auto max-w-3xl">
      <header className="border-b border-border pb-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">
          Documento legal
        </p>
        <h1 className="mt-2 text-3xl font-bold leading-tight text-text sm:text-4xl">
          Política de privacidad
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Esta política explica qué datos personales trata SISTETECNI cuando
          interactúas con nuestro canal de atención por WhatsApp o con el sitio{" "}
          <span className="whitespace-nowrap">sistetecni.com</span>, con qué
          finalidad y durante cuánto tiempo.
        </p>
        <p className="mt-3 text-xs text-muted">
          Última actualización: {ACTUALIZADA}
        </p>
      </header>

      <div className="mt-10 space-y-10 text-sm leading-relaxed text-text">
        {/* 1 */}
        <section>
          <h2 className="text-lg font-semibold text-text">
            1. Quién es el responsable
          </h2>
          <p className="mt-3 text-muted">
            SISTETECNI, establecimiento dedicado a la venta de equipos de
            cómputo corporativos reacondicionados, con atención presencial en
            San Diego, Bogotá (Colombia), es el responsable del tratamiento de
            los datos descritos en este documento.
          </p>
          <p className="mt-3 text-muted">
            Canal de contacto para asuntos de privacidad:{" "}
            <a
              href={`mailto:${CORREO}`}
              className="font-medium text-primary hover:underline"
            >
              {CORREO}
            </a>
            .
          </p>
        </section>

        {/* 2 */}
        <section>
          <h2 className="text-lg font-semibold text-text">
            2. Alcance de esta política
          </h2>
          <p className="mt-3 text-muted">
            Esta política cubre dos situaciones concretas:
          </p>
          <ul className="mt-3 space-y-2 text-muted">
            <li className="flex gap-3">
              <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
              <span>
                Las conversaciones que mantienes con nuestro agente de atención
                automatizada por WhatsApp.
              </span>
            </li>
            <li className="flex gap-3">
              <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
              <span>
                Las solicitudes de cotización que creas en{" "}
                <Link href="/personalizar" className="text-primary hover:underline">
                  sistetecni.com/personalizar
                </Link>
                .
              </span>
            </li>
          </ul>
          <p className="mt-3 text-muted">
            No cubre el tratamiento que WhatsApp o Meta hagan de tus datos como
            usuario de su aplicación, que se rige por las políticas de esas
            compañías.
          </p>
        </section>

        {/* 3 */}
        <section>
          <h2 className="text-lg font-semibold text-text">
            3. Qué es el agente de atención automatizada
          </h2>
          <p className="mt-3 text-muted">
            Cuando escribes a nuestro número de WhatsApp, tu mensaje puede ser
            atendido por un asistente automatizado de SISTETECNI. Ese asistente
            responde preguntas frecuentes, busca equipos en nuestro catálogo
            publicado, informa sobre condiciones de garantía y envíos, y consulta
            el estado de una cotización cuando le indicas su código.
          </p>
          <p className="mt-3 text-muted">
            El asistente no cierra negociaciones ni aprueba condiciones
            especiales. Cuando la conversación llega a un punto que requiere
            criterio comercial —descuentos, casos particulares, información que
            no puede confirmar, o cuando lo pides expresamente—, el sistema lo
            marca para que la atención continúe con una persona del equipo.
          </p>
        </section>

        {/* 4 */}
        <section>
          <h2 className="text-lg font-semibold text-text">
            4. Qué datos podemos tratar
          </h2>

          <h3 className="mt-5 text-sm font-semibold text-text">
            4.1 Cuando escribes por WhatsApp
          </h3>
          <p className="mt-2 text-muted">
            La plataforma de WhatsApp Cloud API entrega a nuestro sistema:
          </p>
          <ul className="mt-3 space-y-2 text-muted">
            <li className="flex gap-3">
              <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
              <span>
                <span className="font-medium text-text">
                  El número desde el que escribes
                </span>{" "}
                (identificador de remitente de WhatsApp). Se utiliza únicamente
                como dirección de respuesta. Dentro de nuestro sistema se
                convierte de inmediato en un identificador seudónimo, y es ese
                identificador —no el número— el que se usa para agrupar la
                conversación y para los registros técnicos.
              </span>
            </li>
            <li className="flex gap-3">
              <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
              <span>
                <span className="font-medium text-text">
                  El contenido de los mensajes de texto que envías
                </span>
                , que es lo que permite entender y responder tu consulta.
              </span>
            </li>
            <li className="flex gap-3">
              <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
              <span>
                <span className="font-medium text-text">
                  Identificadores técnicos y marcas de tiempo
                </span>
                : el identificador del mensaje asignado por la plataforma, su
                fecha y hora, y el tipo de mensaje (texto, imagen, audio…).
              </span>
            </li>
            <li className="flex gap-3">
              <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
              <span>
                <span className="font-medium text-text">
                  La información que decidas contarnos
                </span>{" "}
                durante la conversación: qué equipo buscas, para qué lo
                necesitas, tu presupuesto aproximado, el código de una cotización
                o cualquier otro dato que escribas voluntariamente en el chat.
              </span>
            </li>
          </ul>
          <p className="mt-3 text-muted">
            Si envías una imagen, un audio, un documento, una ubicación u otro
            tipo de contenido que no sea texto, el asistente no lo procesa: te
            responde indicando que solo puede leer mensajes de texto.
          </p>

          <h3 className="mt-6 text-sm font-semibold text-text">
            4.2 Cuando solicitas una cotización en el sitio web
          </h3>
          <p className="mt-2 text-muted">
            El formulario de personalización de equipos guarda la configuración
            que armaste (equipo base, mejoras seleccionadas y precio estimado en
            ese momento), y de forma opcional tu ciudad, tu presupuesto y una
            nota libre que puedes escribir tú. Cada solicitud recibe un código
            del tipo <span className="font-mono text-text">COT-XXXXXX</span> que
            no contiene ningún dato tuyo.
          </p>
        </section>

        {/* 5 */}
        <section>
          <h2 className="text-lg font-semibold text-text">
            5. Qué no pedimos ni recopilamos
          </h2>
          <ul className="mt-3 space-y-2 text-muted">
            <li className="flex gap-3">
              <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
              <span>
                El formulario de cotización de la web{" "}
                <span className="font-medium text-text">
                  no pide nombre, teléfono ni correo electrónico
                </span>
                , y la solicitud se guarda sin esos campos.
              </span>
            </li>
            <li className="flex gap-3">
              <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
              <span>
                El agente de WhatsApp{" "}
                <span className="font-medium text-text">
                  no lee ni almacena el nombre de perfil
                </span>{" "}
                asociado a tu cuenta de WhatsApp: de todo el evento que envía la
                plataforma, solo se extraen los campos descritos en el punto 4.1.
              </span>
            </li>
            <li className="flex gap-3">
              <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
              <span>
                No pedimos ni tratamos deliberadamente datos sensibles, datos
                bancarios, documentos de identidad ni datos de menores de edad a
                través de estos canales. Si los envías por iniciativa propia en
                un mensaje, puedes solicitar su eliminación.
              </span>
            </li>
            <li className="flex gap-3">
              <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
              <span>
                Estas páginas legales no usan cookies, no requieren inicio de
                sesión y no ejecutan rastreadores publicitarios.
              </span>
            </li>
          </ul>
        </section>

        {/* 6 */}
        <section>
          <h2 className="text-lg font-semibold text-text">
            6. Para qué usamos estos datos
          </h2>
          <ul className="mt-3 space-y-2 text-muted">
            <li className="flex gap-3">
              <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
              <span>Responder tus consultas y atender solicitudes comerciales.</span>
            </li>
            <li className="flex gap-3">
              <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
              <span>
                Recomendar equipos de nuestro catálogo y consultar su precio y
                disponibilidad publicados.
              </span>
            </li>
            <li className="flex gap-3">
              <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
              <span>
                Informar el estado y la vigencia de una cotización cuando nos das
                su código.
              </span>
            </li>
            <li className="flex gap-3">
              <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
              <span>
                Derivar la conversación a una persona del equipo cuando el caso
                lo requiere.
              </span>
            </li>
            <li className="flex gap-3">
              <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
              <span>
                Seguridad del servicio: verificar que los mensajes recibidos
                provienen realmente de la plataforma de WhatsApp y limitar el uso
                abusivo del canal.
              </span>
            </li>
            <li className="flex gap-3">
              <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
              <span>
                Evitar respuestas duplicadas cuando la plataforma reenvía un
                mismo mensaje.
              </span>
            </li>
            <li className="flex gap-3">
              <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
              <span>
                Diagnóstico técnico: detectar y corregir fallos del servicio.
              </span>
            </li>
          </ul>
          <p className="mt-3 text-muted">
            No vendemos tus datos, no los cedemos a terceros con fines
            publicitarios y no los usamos para publicidad dirigida.
          </p>
        </section>

        {/* 7 */}
        <section>
          <h2 className="text-lg font-semibold text-text">
            7. Automatización e inteligencia artificial
          </h2>
          <p className="mt-3 text-muted">
            Las respuestas del canal de WhatsApp pueden ser generadas por un
            sistema automatizado que utiliza un modelo de lenguaje. Ese modelo se
            ejecuta en infraestructura propia de SISTETECNI:{" "}
            <span className="font-medium text-text">
              el contenido de tus mensajes no se envía a proveedores externos de
              inteligencia artificial
            </span>{" "}
            para generar la respuesta.
          </p>
          <p className="mt-3 text-muted">
            El modelo trabaja con el texto de la conversación y con la
            información comercial que el sistema le entrega (catálogo, políticas
            de garantía y envíos, datos de una cotización consultada por su
            código). No recibe credenciales de acceso ni consulta directamente
            las bases de datos: esas consultas las realiza el sistema con
            permisos acotados y le devuelve solo el resultado.
          </p>
          <p className="mt-3 text-muted">
            Datos como el precio, el estado y la vigencia de una cotización se
            componen a partir del registro guardado y no los redacta el modelo.
            Además, las respuestas pasan por controles internos antes de
            enviarse. Aun así, un sistema automatizado puede equivocarse: si algo
            no te cuadra, pide hablar con un asesor y una persona revisará tu
            caso. El asistente no toma decisiones que produzcan efectos legales
            sobre ti.
          </p>
        </section>

        {/* 8 */}
        <section>
          <h2 className="text-lg font-semibold text-text">
            8. Proveedores que intervienen
          </h2>
          <p className="mt-3 text-muted">
            Para prestar este servicio nos apoyamos en terceros que actúan como
            proveedores de infraestructura. Cada uno interviene solo en la parte
            que le corresponde:
          </p>
          <div className="mt-4 space-y-3">
            {[
              {
                nombre: "Meta Platforms (WhatsApp)",
                texto:
                  "Transporta los mensajes entre tu aplicación de WhatsApp y nuestro sistema. El tratamiento que Meta hace de tus datos como usuario de WhatsApp se rige por sus propias políticas.",
              },
              {
                nombre: "Cloudflare",
                texto:
                  "Provee la conexión de red cifrada por la que viajan los eventos de WhatsApp hasta nuestro servidor.",
              },
              {
                nombre: "Supabase",
                texto:
                  "Aloja la base de datos donde están el catálogo de productos y las solicitudes de cotización descritas en el punto 4.2. El agente consulta el catálogo con una clave de solo lectura.",
              },
              {
                nombre: "Vercel",
                texto:
                  "Aloja y sirve el sitio sistetecni.com, incluida esta página.",
              },
              {
                nombre: "Infraestructura propia de SISTETECNI",
                texto:
                  "Ejecuta el agente y el modelo de inteligencia artificial que genera las respuestas.",
              },
            ].map((p) => (
              <div
                key={p.nombre}
                className="rounded-xl border border-border bg-surface p-4"
              >
                <div className="text-sm font-semibold text-text">{p.nombre}</div>
                <p className="mt-1 text-sm text-muted">{p.texto}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-muted">
            Algunos de estos proveedores operan servidores fuera de Colombia, por
            lo que los datos descritos pueden ser procesados en el exterior por
            cuenta de SISTETECNI.
          </p>
        </section>

        {/* 9 */}
        <section>
          <h2 className="text-lg font-semibold text-text">
            9. Seguridad
          </h2>
          <p className="mt-3 text-muted">
            Aplicamos medidas técnicas razonables y proporcionales al tamaño de
            nuestra operación. Sin entrar en detalles que puedan comprometer el
            servicio, estas son las principales:
          </p>
          <ul className="mt-3 space-y-2 text-muted">
            <li className="flex gap-3">
              <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
              <span>
                Las comunicaciones entre la plataforma de WhatsApp y nuestro
                sistema viajan cifradas y se verifica criptográficamente que cada
                evento recibido proviene realmente de esa plataforma; lo que no
                supera esa verificación se descarta sin procesarse.
              </span>
            </li>
            <li className="flex gap-3">
              <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
              <span>
                Tu número no circula por los componentes internos del sistema:
                se sustituye por un identificador seudónimo.
              </span>
            </li>
            <li className="flex gap-3">
              <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
              <span>
                Los registros técnicos están configurados para no guardar el
                contenido de los mensajes ni tu número de teléfono, y las
                credenciales se ocultan automáticamente en ellos.
              </span>
            </li>
            <li className="flex gap-3">
              <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
              <span>
                Cada componente accede a los datos con el nivel de permisos
                mínimo que necesita, y el listado completo de cotizaciones solo
                es accesible desde el panel administrativo autenticado.
              </span>
            </li>
          </ul>
          <p className="mt-3 text-muted">
            Ningún sistema es infalible. No declaramos certificaciones de
            seguridad ni auditorías externas, porque no las tenemos.
          </p>
        </section>

        {/* 10 */}
        <section>
          <h2 className="text-lg font-semibold text-text">
            10. Cuánto tiempo conservamos la información
          </h2>
          <p className="mt-3 text-muted">
            Los plazos que indicamos son los que el sistema aplica realmente:
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-3 pr-4 font-semibold text-text">Dato</th>
                  <th className="py-3 font-semibold text-text">Conservación</th>
                </tr>
              </thead>
              <tbody className="text-muted">
                <tr className="border-b border-border align-top">
                  <td className="py-3 pr-4 font-medium text-text">
                    Contexto de la conversación de WhatsApp
                  </td>
                  <td className="py-3">
                    Solo en memoria del proceso, limitado a los últimos turnos.
                    Se descarta tras 30 minutos sin actividad y también cuando el
                    servicio se reinicia. No se guarda en disco ni en base de
                    datos.
                  </td>
                </tr>
                <tr className="border-b border-border align-top">
                  <td className="py-3 pr-4 font-medium text-text">
                    Tu número de WhatsApp
                  </td>
                  <td className="py-3">
                    Se usa para responderte durante el turno y no se guarda en
                    ningún almacenamiento persistente de nuestro agente.
                  </td>
                </tr>
                <tr className="border-b border-border align-top">
                  <td className="py-3 pr-4 font-medium text-text">
                    Registro anti-duplicados
                  </td>
                  <td className="py-3">
                    Guarda únicamente el identificador técnico del mensaje, su
                    estado de procesamiento y una marca de tiempo. No contiene el
                    texto del mensaje ni tu número. Las entradas dejan de tenerse
                    en cuenta pasadas 24 horas y se depuran del archivo.
                  </td>
                </tr>
                <tr className="border-b border-border align-top">
                  <td className="py-3 pr-4 font-medium text-text">
                    Registros técnicos de operación
                  </td>
                  <td className="py-3">
                    Contienen eventos del servicio (identificador seudónimo de
                    sesión, identificador abreviado del mensaje, duraciones,
                    errores). Con la configuración actual no incluyen el
                    contenido de los mensajes ni tu número. No tienen un plazo de
                    borrado automático fijado en el sistema; se conservan
                    mientras son útiles para diagnóstico y se depuran
                    periódicamente.
                  </td>
                </tr>
                <tr className="align-top">
                  <td className="py-3 pr-4 font-medium text-text">
                    Solicitudes de cotización
                  </td>
                  <td className="py-3">
                    La cotización deja de estar vigente a los 7 días de creada.
                    El registro permanece en nuestra base comercial mientras sea
                    necesario para atender la solicitud y para nuestro historial
                    de ventas; no existe un borrado automático programado.
                    Puedes pedir su eliminación como se explica en el punto 12.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-muted">
            El historial del chat que queda en tu teléfono y en la
            infraestructura de WhatsApp no depende de nosotros y no podemos
            borrarlo por ti.
          </p>
        </section>

        {/* 11 */}
        <section>
          <h2 className="text-lg font-semibold text-text">
            11. Tus derechos
          </h2>
          <p className="mt-3 text-muted">
            Buscamos actuar conforme a la normativa colombiana aplicable en
            materia de protección de datos personales. En ese marco puedes:
          </p>
          <ul className="mt-3 space-y-2 text-muted">
            <li className="flex gap-3">
              <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
              <span>
                Conocer qué información asociada a tu interacción conservamos.
              </span>
            </li>
            <li className="flex gap-3">
              <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
              <span>Solicitar que se corrija o actualice.</span>
            </li>
            <li className="flex gap-3">
              <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
              <span>Solicitar su eliminación.</span>
            </li>
            <li className="flex gap-3">
              <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
              <span>
                Pedir que la atención continúe con una persona en lugar del
                asistente automatizado.
              </span>
            </li>
            <li className="flex gap-3">
              <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
              <span>
                Presentar una queja ante la autoridad de protección de datos
                competente.
              </span>
            </li>
          </ul>
          <p className="mt-3 text-muted">
            Este documento describe cómo funciona nuestro sistema y no
            constituye asesoría jurídica.
          </p>
        </section>

        {/* 12 */}
        <section>
          <h2 className="text-lg font-semibold text-text">
            12. Cómo ejercer tus derechos
          </h2>
          <p className="mt-3 text-muted">
            Escríbenos a{" "}
            <a
              href={`mailto:${CORREO}`}
              className="font-medium text-primary hover:underline"
            >
              {CORREO}
            </a>{" "}
            indicando qué solicitas. Para eliminar información, en la página de{" "}
            <Link
              href="/eliminacion-de-datos"
              className="font-medium text-primary hover:underline"
            >
              eliminación de datos
            </Link>{" "}
            explicamos paso a paso qué debes enviarnos.
          </p>
          <p className="mt-3 text-muted">
            Atenderemos tu solicitud en el menor tiempo posible y dentro de los
            términos que fije la normativa aplicable. Podemos pedirte
            información adicional razonable para confirmar que la solicitud
            proviene del titular de los datos.
          </p>
        </section>

        {/* 13 */}
        <section>
          <h2 className="text-lg font-semibold text-text">
            13. Cambios en esta política
          </h2>
          <p className="mt-3 text-muted">
            Podemos actualizar este documento si cambia la forma en que
            funcionan nuestros servicios. La versión vigente será siempre la
            publicada en esta página, con su fecha de última actualización.
          </p>
        </section>

        <section className="rounded-2xl border border-border bg-surface p-6">
          <h2 className="text-base font-semibold text-text">Contacto</h2>
          <p className="mt-2 text-muted">
            Dudas sobre esta política o sobre tus datos:{" "}
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
