/**
 * `state` firmado — OPORTUNISTA a propósito.
 *
 * ── POR QUÉ NO ES OBLIGATORIO ────────────────────────────────────────────
 * En Meta-hosted Embedded Signup el enlace de onboarding lo genera Meta desde
 * el App Dashboard. La documentación oficial NO describe ninguna forma de
 * añadirle parámetros propios, así que hoy no podemos originar un `state`
 * nuestro. Exigirlo convertiría el callback en un endpoint que siempre falla,
 * y aceptar cualquier `state` que llegue como si lo hubiéramos emitido sería
 * una protección falsa: peor que no tenerla, porque induce a confiar.
 *
 * Por eso este módulo distingue tres desenlaces y NUNCA inventa un cuarto:
 *
 *   verificado    → el valor lleva nuestra firma y está dentro del TTL.
 *   no_verificable→ llegó un `state` que NO emitimos nosotros. No es prueba de
 *                   ataque: puede ser un valor propio de Meta. Se registra.
 *   ausente       → no llegó ninguno.
 *
 * Si en el futuro Meta documenta cómo inyectar `state` en el enlace, el
 * callback pasa a exigir "verificado" cambiando una condición, sin tocar esto.
 */
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

export type ResultadoState = "verificado" | "no_verificable" | "ausente";

/** Diez minutos: de sobra para completar el flujo, corto para reutilizarlo. */
export const TTL_STATE_MS = 10 * 60 * 1000;

function firmar(carga: string, secreto: string): string {
  return createHmac("sha256", secreto).update(carga).digest("base64url");
}

/**
 * Comparación en tiempo constante sobre HMACs de los valores, no sobre los
 * valores: así longitudes distintas no lanzan ni revelan nada.
 */
function igualdadSegura(a: string, b: string): boolean {
  const clave = "comparacion-state";
  const ha = createHmac("sha256", clave).update(a).digest();
  const hb = createHmac("sha256", clave).update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Emite un `state` firmado: `<nonce>.<ts>.<firma>`.
 *
 * Existe para el día en que podamos originarlo (o para un arranque propio
 * hacia el flujo). Hoy no se usa en el camino de Hosted ES.
 */
export function crearState(secreto: string, ahora: number = Date.now()): string {
  const nonce = randomBytes(32).toString("base64url");
  const carga = `${nonce}.${ahora}`;
  return `${carga}.${firmar(carga, secreto)}`;
}

export function validarState(
  valor: string | null | undefined,
  secreto: string,
  { ahora = Date.now(), ttlMs = TTL_STATE_MS }: { ahora?: number; ttlMs?: number } = {}
): ResultadoState {
  if (!valor) return "ausente";

  const partes = valor.split(".");
  if (partes.length !== 3) return "no_verificable";

  const [nonce, ts, firma] = partes;
  if (!igualdadSegura(firma, firmar(`${nonce}.${ts}`, secreto))) return "no_verificable";

  const emitido = Number(ts);
  if (!Number.isFinite(emitido)) return "no_verificable";
  if (ahora - emitido > ttlMs || ahora < emitido) return "no_verificable";

  return "verificado";
}
