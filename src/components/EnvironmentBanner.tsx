"use client";

import { getEnvironment } from "@/lib/env/environment";

/**
 * Aviso visual de entorno. Su único trabajo es leer NEXT_PUBLIC_APP_ENV
 * (la única variable de entorno disponible en el navegador) y avisar sin
 * ambigüedad cuando NO se está en producción.
 *
 * NO es la barrera de seguridad real — esa es assertNotProduction(), que
 * corre server-side en scripts destructivos y sí puede leer
 * SUPABASE_PROJECT_REF_PRODUCTION para la validación de coherencia completa
 * (esa variable no tiene prefijo NEXT_PUBLIC_, así que aquí no está disponible
 * y esa parte del chequeo simplemente se omite — getEnvironment() no lo trata
 * como error, ver src/lib/env/environment.mjs).
 *
 * IMPORTANTE — por qué se construye un objeto explícito en vez de pasar
 * `process.env` directamente: Next.js solo puede inlinear en el bundle de
 * cliente los accesos ESTÁTICOS Y LITERALES de la forma
 * `process.env.NEXT_PUBLIC_X` (su DefinePlugin hace reemplazo de texto
 * sobre ese patrón exacto en tiempo de build). Pasar el objeto `process.env`
 * completo, o leerlo dinámicamente dentro de getEnvironment() vía un
 * parámetro (`env.NEXT_PUBLIC_APP_ENV`), NO es un acceso estático — en el
 * navegador, `process.env` cae a un polyfill vacío en runtime, así que esa
 * lectura indirecta siempre da `undefined`, aunque la variable esté bien
 * configurada en Vercel. Por eso cada NEXT_PUBLIC_* que este componente
 * necesita se lee aquí con su propia expresión literal completa, y SOLO
 * ese objeto ya resuelto (con valores primitivos, no una referencia a
 * process.env) se le pasa a getEnvironment().
 *
 * En producción normal (NEXT_PUBLIC_APP_ENV=production) no renderiza nada.
 */
export default function EnvironmentBanner() {
  const info = getEnvironment({
    NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    // SUPABASE_PROJECT_REF_PRODUCTION es server-only (sin prefijo
    // NEXT_PUBLIC_) — nunca puede leerse en el navegador, se omite a
    // propósito (ver comentario de arriba). getEnvironment() ya maneja
    // su ausencia sin marcarla como error.
  });

  if (info.appEnv === "production") {
    return null;
  }

  if (info.appEnv === "staging") {
    return (
      <div
        role="status"
        className="sticky top-0 z-[100] w-full bg-amber-500 px-4 py-2 text-center text-sm font-semibold text-black"
      >
        ⚠ STAGING — datos de prueba, no es el sitio real
        {info.supabaseProjectRef ? ` (${info.supabaseProjectRef})` : ""}
      </div>
    );
  }

  // appEnv === null: NEXT_PUBLIC_APP_ENV ausente o inválida. Silencio total
  // aquí sería peor que un banner molesto — es exactamente la confusión que
  // este mecanismo existe para evitar, solo que al revés (no saber en qué
  // entorno se está, en vez de creer estar en el equivocado).
  return (
    <div
      role="alert"
      className="sticky top-0 z-[100] w-full bg-red-600 px-4 py-2 text-center text-sm font-semibold text-white"
    >
      ⚠ ENTORNO NO CONFIGURADO — falta o es inválida NEXT_PUBLIC_APP_ENV
    </div>
  );
}
