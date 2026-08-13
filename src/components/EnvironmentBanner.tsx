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
 * como error, ver src/lib/env/environment.ts).
 *
 * En producción normal (NEXT_PUBLIC_APP_ENV=production) no renderiza nada.
 */
export default function EnvironmentBanner() {
  const info = getEnvironment(process.env as unknown as Record<string, string | undefined>);

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
