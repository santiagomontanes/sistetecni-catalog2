/**
 * P20.28D · catálogo PDF: todas las fotos, ficha completa y contrato intacto.
 *
 * El catálogo lo recibe el cliente por WhatsApp para decidir una compra, y el
 * bot lo usa además como referencia: cuando alguien dice "el tercero", el
 * agente resuelve contra la MISMA lista y el MISMO orden que ve el cliente.
 * Por eso aquí no solo se prueba el aspecto: se protege ese contrato.
 *
 * Sin red: `fetchImpl` se sustituye por uno falso que devuelve JPEG mínimos.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { buildCatalogPdfBytes, type CatalogProduct } from "./buildCatalogPdf";

/**
 * Número de páginas del PDF.
 *
 * Se lee con pdf-lib, no buscando "/Type /Page" en los bytes: los flujos de
 * contenido van comprimidos y esa búsqueda daba cero siempre.
 */
async function paginasDe(bytes: Uint8Array): Promise<number> {
  return (await PDFDocument.load(bytes)).getPageCount();
}

const HOST = "ejemplo.supabase.co";
const url = (n: string) => `https://${HOST}/storage/v1/object/public/products/${n}.jpg`;

/**
 * JPEG 1×1 válido. Hace falta que pdf-lib lo pueda decodificar de verdad: un
 * buffer inventado haría fallar el embebido y el test probaría el camino de
 * degradación en vez del real.
 */
const JPEG_1X1 = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a" +
    "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA" +
    "AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64"
);

/** `fetch` falso: cuenta las descargas y nunca sale a la red. */
function fetchFalso(): { impl: typeof fetch; pedidas: string[] } {
  const pedidas: string[] = [];
  const impl = (async (entrada: RequestInfo | URL) => {
    pedidas.push(String(entrada));
    return {
      ok: true,
      headers: { get: (h: string) => (h.toLowerCase() === "content-type" ? "image/jpeg" : null) },
      arrayBuffer: async () => JPEG_1X1.buffer.slice(JPEG_1X1.byteOffset, JPEG_1X1.byteOffset + JPEG_1X1.byteLength),
    };
  }) as unknown as typeof fetch;
  return { impl, pedidas };
}

const producto = (over: Partial<CatalogProduct> = {}): CatalogProduct => ({
  id: "p1",
  title: "Acer Corporativo 14in",
  brand: "Acer",
  model: "Corporativo",
  cpu: "Intel 6ta gen",
  ram: 8,
  storage: "500 GB",
  screen: '14"',
  gpuModel: null,
  condition: "REFURBISHED",
  description: null,
  price: 450000,
  warrantyMonths: 6,
  images: null,
  ...over,
});

const construir = (productos: CatalogProduct[], extra: Record<string, unknown> = {}) => {
  const { impl, pedidas } = fetchFalso();
  return {
    pedidas,
    bytes: buildCatalogPdfBytes(productos, {
      allowedImageHosts: [HOST],
      fetchImpl: impl,
      generatedAt: new Date("2026-09-25T12:00:00Z"),
      ...extra,
    }),
  };
};

describe("P20.28D · todas las fotos de cada equipo", () => {
  test("C01 · un equipo con 5 fotos las pide todas, no solo la primera", async () => {
    const imgs = ["a", "b", "c", "d", "e"].map(url);
    const { pedidas, bytes } = construir([producto({ images: imgs })]);
    await bytes;
    assert.deepEqual(pedidas, imgs, "antes solo se descargaba images[0]");
  });

  test("C02 · cada equipo pide las suyas", async () => {
    const { pedidas, bytes } = construir([
      producto({ id: "p1", images: [url("a1"), url("a2")] }),
      producto({ id: "p2", images: [url("b1"), url("b2"), url("b3")] }),
    ]);
    await bytes;
    assert.equal(pedidas.length, 5);
  });

  test("C03 · las fotos NO se cruzan entre productos", async () => {
    // Si se cruzaran, el orden de descarga o de embebido mezclaría las URLs.
    // Se comprueba que cada bloque de peticiones corresponde a su producto.
    const { pedidas, bytes } = construir([
      producto({ id: "p1", images: [url("a1"), url("a2")] }),
      producto({ id: "p2", images: [url("b1")] }),
      producto({ id: "p3", images: [url("c1"), url("c2"), url("c3")] }),
    ]);
    await bytes;
    assert.deepEqual(pedidas, [url("a1"), url("a2"), url("b1"), url("c1"), url("c2"), url("c3")]);
  });

  test("el tope por producto acota el peso sin omitir en silencio", async () => {
    const muchas = Array.from({ length: 20 }, (_, i) => url(`f${i}`));
    const { pedidas, bytes } = construir([producto({ images: muchas })], { maxImagesPerProduct: 4 });
    await bytes;
    assert.equal(pedidas.length, 4);
  });

  test("una foto de otro host no se descarga (SSRF)", async () => {
    const { pedidas, bytes } = construir([
      producto({ images: ["https://malicioso.example/x.jpg", url("ok")] }),
    ]);
    await bytes;
    assert.deepEqual(pedidas, [url("ok")], "solo se descarga la del host permitido");
  });
});

describe("P20.28D · la ficha va completa", () => {
  test("C07 · una descripción larga NO se recorta", async () => {
    const larga = [
      "Portátil corporativo pensado para oficina.",
      "⚙️ CARACTERÍSTICAS",
      ...Array.from({ length: 40 }, (_, i) => `• Característica número ${i + 1} del equipo`),
      "🔌 PUERTOS Y CONECTIVIDAD",
      ...Array.from({ length: 20 }, (_, i) => `• Puerto número ${i + 1}`),
    ].join("\n");
    const corta = await construir([producto({ description: "Equipo de oficina.", images: [url("a")] })]).bytes;
    const extensa = await construir([producto({ description: larga, images: [url("a")] })]).bytes;
    const muyExtensa = await construir([
      producto({
        description: Array.from({ length: 300 }, (_, i) => `• Línea número ${i + 1} de la ficha`).join("\n"),
        images: [url("a")],
      }),
    ]).bytes;

    // La prueba de que NADA se recorta: el PDF crece con el texto. Antes la
    // descripción se cortaba a tres líneas y el número de páginas era el mismo
    // dijera lo que dijera la ficha.
    const pCorta = await paginasDe(corta);
    const pExtensa = await paginasDe(extensa);
    const pMuyExtensa = await paginasDe(muyExtensa);
    assert.ok(pExtensa >= pCorta, `extensa=${pExtensa} corta=${pCorta}`);
    assert.ok(pMuyExtensa > pExtensa, `300 líneas deben ocupar más que 60 (${pMuyExtensa} vs ${pExtensa})`);
    assert.ok(pMuyExtensa >= 4, `esperaba 4+ páginas con 300 líneas, hubo ${pMuyExtensa}`);
  });

  test("un equipo sin descripción ni fotos no rompe el catálogo", async () => {
    const { bytes } = construir([producto({ description: null, images: null })]);
    assert.ok((await bytes).byteLength > 0);
  });

  test("un catálogo vacío sigue generando un PDF con su aviso", async () => {
    const { bytes } = construir([]);
    assert.ok((await bytes).byteLength > 0);
  });

  test("una imagen corrupta degrada esa foto, no el catálogo", async () => {
    const impl = (async () => ({
      ok: true,
      headers: { get: () => "image/jpeg" },
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    })) as unknown as typeof fetch;
    const pdf = await buildCatalogPdfBytes([producto({ images: [url("rota")] })], {
      allowedImageHosts: [HOST],
      fetchImpl: impl,
    });
    assert.ok(pdf.byteLength > 0);
  });
});

describe("P20.28D · el contrato con el agente no cambia", () => {
  // El bot resuelve "el tercero" contra la MISMA lista, en el MISMO orden, y
  // valida que su recuento coincida con el del PDF. Si el generador reordenara
  // o descartara productos, señalaría el equipo equivocado.
  test("el generador respeta el orden que recibe, sin filtrar ni reordenar", async () => {
    // El orden es observable en las descargas: la ficha 1 pide sus fotos
    // antes que la 2. Si el generador reordenara, "el tercero" del cliente y
    // el del bot dejarían de ser el mismo equipo.
    const { pedidas, bytes } = construir([
      producto({ id: "p1", title: "Equipo Alfa", price: 400000, images: [url("alfa")] }),
      producto({ id: "p2", title: "Equipo Beta", price: 500000, images: [url("beta")] }),
      producto({ id: "p3", title: "Equipo Gamma", price: 600000, images: [url("gamma")] }),
    ]);
    await bytes;
    assert.deepEqual(pedidas, [url("alfa"), url("beta"), url("gamma")]);
  });

  test("más productos producen más páginas: ninguno se queda fuera", async () => {
    const uno = await construir([producto({ id: "p1" })]).bytes;
    const varios = await construir(
      Array.from({ length: 6 }, (_, i) => producto({ id: `p${i}`, title: `Equipo ${i}` }))
    ).bytes;
    assert.ok(await paginasDe(varios) > await paginasDe(uno));
  });
});
