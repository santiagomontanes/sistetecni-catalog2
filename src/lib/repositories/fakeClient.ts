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
  ilike() {
    return this;
  }
  insert() {
    return this;
  }
  update() {
    return this;
  }
  delete() {
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

/**
 * Cliente falso CON ESTADO — simula una única tabla en memoria (array de
 * filas), soportando select/eq/in (filtros reales, no canned) e
 * insert/update (mutan el array real). Necesario para probar lógica de
 * diffing como ProductUpgradeOptionsRepository.setCompatibility, donde el
 * fake "de un solo resultado fijo" (FakeQueryBuilder de arriba) no alcanza
 * — esa función hace una lectura y LUEGO decide qué insertar/reactivar/
 * desactivar según lo que leyó.
 */
export function makeStatefulFakeClient<Row extends object>(initialRows: Row[]) {
  const rows: Row[] = [...initialRows];

  /** Soporta "columna" simple y "relacion.columna" (filtro sobre join embebido, como usa Postgrest). */
  function field(row: Row, column: string): unknown {
    return column.split(".").reduce<unknown>((value, key) => {
      if (value && typeof value === "object") return (value as Record<string, unknown>)[key];
      return undefined;
    }, row);
  }

  class StatefulBuilder implements PromiseLike<{ data: Row[] | null; error: unknown }> {
    private filters: Array<(row: Row) => boolean> = [];
    private mode: "select" | "insert" | "update" = "select";
    private patch: Partial<Row> | null = null;
    private insertRows: Row[] = [];

    select() {
      return this;
    }
    eq(column: string, value: unknown) {
      this.filters.push((row) => field(row, column) === value);
      return this;
    }
    in(column: string, values: unknown[]) {
      this.filters.push((row) => values.includes(field(row, column)));
      return this;
    }
    ilike(column: string, pattern: string) {
      const needle = pattern.replace(/%/g, "").toLowerCase();
      this.filters.push((row) => String(field(row, column) ?? "").toLowerCase().includes(needle));
      return this;
    }
    order() {
      return this;
    }
    insert(newRows: Row | Row[]) {
      this.mode = "insert";
      this.insertRows = Array.isArray(newRows) ? newRows : [newRows];
      return this;
    }
    update(patch: Partial<Row>) {
      this.mode = "update";
      this.patch = patch;
      return this;
    }
    returns<U>() {
      return this as unknown as PromiseLike<{ data: U | null; error: unknown }>;
    }
    async single() {
      const { data } = await this;
      return { data: (data ?? [])[0] ?? null, error: null };
    }
    async maybeSingle() {
      return this.single();
    }

    private matching(): Row[] {
      return rows.filter((row) => this.filters.every((f) => f(row)));
    }

    then<TResult1 = { data: Row[] | null; error: unknown }, TResult2 = never>(
      onfulfilled?: ((value: { data: Row[] | null; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ): PromiseLike<TResult1 | TResult2> {
      let result: { data: Row[] | null; error: unknown };
      if (this.mode === "insert") {
        rows.push(...this.insertRows);
        result = { data: this.insertRows, error: null };
      } else if (this.mode === "update") {
        const targets = this.matching();
        for (const row of targets) Object.assign(row, this.patch);
        result = { data: targets, error: null };
      } else {
        result = { data: this.matching(), error: null };
      }
      return Promise.resolve(result).then(onfulfilled, onrejected);
    }
  }

  return {
    client: {
      from: () => new StatefulBuilder(),
    } as unknown as SupabaseClient,
    rows,
  };
}
