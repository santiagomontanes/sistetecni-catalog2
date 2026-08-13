/**
 * Cliente Supabase SERVER-ONLY, con SUPABASE_SERVICE_ROLE_KEY.
 *
 * NUNCA importar desde un componente "use client" ni desde ningún código
 * que se ejecute en el navegador — bypassa RLS por completo. Úsalo solo
 * desde Server Actions, Route Handlers, o scripts Node (seed, tests de
 * integración) que ya hayan pasado por assertNotProduction() cuando
 * corresponda.
 *
 * No se usa el paquete `server-only` (no es una dependencia existente del
 * proyecto — ver package.json — y no se agrega una dependencia nueva para
 * 3 líneas de guard, según lo pedido). Se replica manualmente el mismo
 * mecanismo: lanzar si `window` existe.
 *
 * Nota de fondo sobre por qué esto es seguro incluso sin el guard: Next.js
 * solo inyecta en el bundle del navegador las variables con prefijo
 * NEXT_PUBLIC_. SUPABASE_SERVICE_ROLE_KEY nunca lo tiene, así que aunque
 * este archivo se importara por error desde código de cliente, la clave
 * NUNCA llegaría al bundle — el guard de abajo solo convierte ese error en
 * un mensaje claro e inmediato en vez de un fallo confuso más adelante.
 */

if (typeof window !== "undefined") {
  throw new Error(
    "src/supabase/admin.ts se importó en código que corre en el navegador. " +
      "Este módulo usa SUPABASE_SERVICE_ROLE_KEY y NUNCA debe ejecutarse en el cliente — " +
      "revisa la cadena de imports que llegó hasta aquí."
  );
}

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    // Mensaje claro, con el NOMBRE de la variable — nunca con ningún valor.
    throw new Error(
      `[supabase/admin] Falta la variable de entorno "${name}". ` +
        `No se puede crear el cliente admin sin ella.`
    );
  }
  return value;
}

let cachedClient: SupabaseClient | null = null;

/**
 * Crea (una sola vez por proceso) el cliente admin. Lazy a propósito: así
 * importar este módulo no falla solo por importarlo — falla al intentar
 * USARLO sin configuración, que es cuando realmente hace falta el error.
 * También hace testeable la falta de variables sin gimnasia de módulos.
 */
export function getAdminClient(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const url = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  cachedClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return cachedClient;
}

/** Solo para tests: fuerza que la próxima llamada a getAdminClient() recree el cliente. */
export function _resetAdminClientForTests(): void {
  cachedClient = null;
}
