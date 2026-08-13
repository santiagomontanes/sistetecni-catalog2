import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Doble de prueba mínimo para SupabaseClient — solo para tests unitarios.
 * Cualquier método de encadenamiento (.select/.eq/.in/.order/.returns)
 * devuelve el mismo objeto; es awaitable directamente (implementa .then,
 * como el PostgrestFilterBuilder real) y .maybeSingle()/.single() resuelven
 * al mismo resultado configurado — suficiente para probar que los
 * repositorios propagan errores y mapean filas correctamente, sin
 * necesitar una conexión real.
 */
class FakeQueryBuilder<T> implements PromiseLike<{ data: T | null; error: unknown }> {
  constructor(private readonly result: { data: T | null; error: unknown }) {}

  select() {
    return this;
  }
  eq() {
    return this;
  }
  in() {
    return this;
  }
  or() {
    return this;
  }
  order() {
    return this;
  }
  returns<U>() {
    return this as unknown as FakeQueryBuilder<U>;
  }
  async maybeSingle() {
    return this.result;
  }
  async single() {
    return this.result;
  }
  then<TResult1 = { data: T | null; error: unknown }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: T | null; error: unknown }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.result).then(onfulfilled, onrejected);
  }
}

/** Un cliente falso cuya única tabla configurada devuelve siempre `result`. */
export function makeFakeClient<T>(result: { data: T | null; error: unknown }): SupabaseClient {
  return {
    from: () => new FakeQueryBuilder<T>(result),
  } as unknown as SupabaseClient;
}
