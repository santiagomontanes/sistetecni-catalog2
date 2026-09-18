/**
 * P20.19-bis (corrección smoke STAGING) — CAS real de `mutarImagenes()`.
 *
 * ── EL BUG QUE SE PRUEBA AQUÍ ─────────────────────────────────────────────
 * `.eq("images", before)` con `before: string[]` de JS NUNCA iguala la
 * columna `text[]` de Postgres vía PostgREST — el UPDATE afectaba CERO
 * filas SIEMPRE (no solo bajo contención real), agotando los 5 reintentos
 * en silencio. Smoke real: 3 fotos subidas al bucket, 0 asociadas en
 * `products.images`. Estos tests fijan el contrato correcto: un literal
 * `text[]` explícito vía `.filter("images","eq",literal)`, y `NULL`
 * distinguido de `{}` vía `.is("images", null)`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mutarImagenes, postgresTextArrayLiteral } from "./productMediaOps";

// ═══════════════════════════════════════════════════════════════════════
// postgresTextArrayLiteral — serializador puro
// ═══════════════════════════════════════════════════════════════════════
test("postgresTextArrayLiteral: una URL normal", () => {
  assert.equal(postgresTextArrayLiteral(["https://x.test/a.jpg"]), '{"https://x.test/a.jpg"}');
});

test("postgresTextArrayLiteral: dos URLs", () => {
  assert.equal(
    postgresTextArrayLiteral(["https://x.test/a.jpg", "https://x.test/b.jpg"]),
    '{"https://x.test/a.jpg","https://x.test/b.jpg"}'
  );
});

test("postgresTextArrayLiteral: array vacío → {}", () => {
  assert.equal(postgresTextArrayLiteral([]), "{}");
});

test("postgresTextArrayLiteral: URL con coma no rompe el literal (va entre comillas)", () => {
  assert.equal(postgresTextArrayLiteral(["https://x.test/a,b.jpg"]), '{"https://x.test/a,b.jpg"}');
});

test("postgresTextArrayLiteral: valor con comillas dobles se escapa con backslash", () => {
  assert.equal(postgresTextArrayLiteral(['foo"bar']), '{"foo\\"bar"}');
});

test("postgresTextArrayLiteral: valor con backslash se duplica (y no se confunde con el escape de comillas)", () => {
  assert.equal(postgresTextArrayLiteral(["foo\\bar"]), '{"foo\\\\bar"}');
  // Orden de escape correcto: un backslash SEGUIDO de una comilla debe
  // decodificar de vuelta exactamente al valor original (1 backslash + 1
  // comilla), no a algo distinto.
  assert.equal(postgresTextArrayLiteral(['a\\"b']), "{\"a\\\\\\\"b\"}");
});

// ═══════════════════════════════════════════════════════════════════════
// mutarImagenes — CAS contra un `client` doble
// ═══════════════════════════════════════════════════════════════════════

/**
 * Doble mínimo del builder encadenable de supabase-js, con SOLO los
 * métodos que `mutarImagenes` realmente usa: `from().select().eq()
 * .maybeSingle()` para leer, y `from().update().eq().is()/.filter()
 * .select()` para escribir. `lecturas[i]`/`actualizaciones[i]` son lo que
 * devuelve el intento i-ésimo (0-based) del bucle de CAS.
 */
function fakeClienteCas({
  lecturas,
  actualizaciones,
}: {
  lecturas: Array<{ images: string[] | null }>;
  actualizaciones: Array<Array<{ images: string[] }>>;
}) {
  let intento = 0;
  const llamadas: Array<{ tipo: "is" | "filter"; literal: string | null }> = [];
  const client = {
    from(_tabla: string) {
      void _tabla;
      return {
        select(_cols: string) {
          void _cols;
          return {
            eq(_col: string, _val: string) {
              void _col;
              void _val;
              return {
                async maybeSingle() {
                  return { data: lecturas[intento], error: null };
                },
              };
            },
          };
        },
        update(_valores: { images: string[] }) {
          void _valores;
          return {
            eq(_col: string, _val: string) {
              void _col;
              void _val;
              const resultado = () => {
                const filas = actualizaciones[intento] ?? [];
                intento += 1;
                return { async select(_c: string) { void _c; return { data: filas, error: null }; } };
              };
              return {
                is(_col: string, _val: null) {
                  void _col;
                  void _val;
                  llamadas.push({ tipo: "is", literal: null });
                  return resultado();
                },
                filter(_col: string, _op: string, literal: string) {
                  void _col;
                  void _op;
                  llamadas.push({ tipo: "filter", literal });
                  return resultado();
                },
              };
            },
          };
        },
      };
    },
  };
  return { client: client as unknown as Parameters<typeof mutarImagenes>[0]["client"], llamadas };
}

test("mutarImagenes: fila con images=NULL compara con .is('images', null), nunca con un literal", async () => {
  const { client, llamadas } = fakeClienteCas({
    lecturas: [{ images: null }],
    actualizaciones: [[{ images: ["https://x.test/a.jpg"] }]],
  });
  const { before, after } = await mutarImagenes({
    client, tabla: "products", columnaId: "id", valorId: "p1",
    mutar: (actuales) => [...actuales, "https://x.test/a.jpg"],
  });
  assert.deepEqual(before, [], "NULL se trata como [] para calcular `after`, pero el CAS usa IS NULL");
  assert.deepEqual(after, ["https://x.test/a.jpg"]);
  assert.equal(llamadas.length, 1);
  assert.equal(llamadas[0].tipo, "is");
});

test("mutarImagenes: fila con images=[] compara contra el literal '{}', NUNCA contra IS NULL", async () => {
  const { client, llamadas } = fakeClienteCas({
    lecturas: [{ images: [] }],
    actualizaciones: [[{ images: ["https://x.test/a.jpg"] }]],
  });
  const { before } = await mutarImagenes({
    client, tabla: "products", columnaId: "id", valorId: "p1",
    mutar: (actuales) => [...actuales, "https://x.test/a.jpg"],
  });
  assert.deepEqual(before, []);
  assert.equal(llamadas.length, 1);
  assert.equal(llamadas[0].tipo, "filter");
  assert.equal(llamadas[0].literal, "{}", "NULL y [] son valores DISTINTOS en Postgres — nunca se confunden");
});

test("mutarImagenes: un conflicto de CAS (0 filas afectadas) reintenta con una lectura fresca", async () => {
  const { client, llamadas } = fakeClienteCas({
    lecturas: [
      { images: ["https://x.test/a.jpg"] },
      { images: ["https://x.test/a.jpg", "https://x.test/b.jpg"] }, // otra operación ya agregó b.jpg
    ],
    actualizaciones: [
      [], // intento 1: 0 filas — el CAS no igualó (alguien más mutó la fila)
      [{ images: ["https://x.test/a.jpg", "https://x.test/b.jpg", "https://x.test/c.jpg"] }], // intento 2: éxito
    ],
  });
  const { before, after } = await mutarImagenes({
    client, tabla: "products", columnaId: "id", valorId: "p1",
    mutar: (actuales) => [...actuales, "https://x.test/c.jpg"],
  });
  assert.equal(llamadas.length, 2, "se reintentó exactamente una vez tras el conflicto");
  assert.equal(llamadas[0].tipo, "filter");
  assert.equal(llamadas[0].literal, postgresTextArrayLiteral(["https://x.test/a.jpg"]));
  assert.equal(llamadas[1].literal, postgresTextArrayLiteral(["https://x.test/a.jpg", "https://x.test/b.jpg"]), "el segundo intento compara contra la lectura FRESCA, no la vieja");
  assert.deepEqual(before, ["https://x.test/a.jpg", "https://x.test/b.jpg"], "el resultado refleja la segunda lectura, no la primera");
  assert.deepEqual(after, ["https://x.test/a.jpg", "https://x.test/b.jpg", "https://x.test/c.jpg"]);
});

test("mutarImagenes: agota los 5 intentos bajo contención real y lanza CONCURRENT_UPDATE_CONFLICT", async () => {
  const { client, llamadas } = fakeClienteCas({
    lecturas: Array.from({ length: 5 }, () => ({ images: ["https://x.test/a.jpg"] })),
    actualizaciones: Array.from({ length: 5 }, () => []), // SIEMPRE 0 filas
  });
  await assert.rejects(
    mutarImagenes({ client, tabla: "products", columnaId: "id", valorId: "p1", mutar: (actuales) => [...actuales, "https://x.test/z.jpg"] }),
    /PRODUCT_MEDIA_PRODUCTS_CONCURRENT_UPDATE_CONFLICT/
  );
  assert.equal(llamadas.length, 5, "se intentó exactamente 5 veces, ni una más");
});
