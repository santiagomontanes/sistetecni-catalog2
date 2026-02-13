import Image from "next/image";

const images = [
  { src: "/gallery/1.jpg", alt: "Laptop corporativa reacondicionada" },
  { src: "/gallery/2.jpg", alt: "Equipo empresarial listo para entrega" },
  { src: "/gallery/3.jpg", alt: "Portátil para estudio y trabajo" },
  { src: "/gallery/4.jpg", alt: "Revisión y mantenimiento profesional" },
  { src: "/gallery/5.jpg", alt: "Equipos alineados en inventario" },
  { src: "/gallery/6.jpg", alt: "Computadores corporativos en excelente estado" },
];

export default function CommercialGallery() {
  return (
    <section className="mt-16">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-text">
            Equipos reales, calidad real
          </h2>
          <p className="mt-2 text-sm text-muted">
            Fotografías de inventario y procesos reales de Sistetecni.
          </p>
        </div>
      </div>

      <div className="mt-8 grid gap-5 sm:grid-cols-2 md:grid-cols-3">
        {images.map((img) => (
          <div
            key={img.src}
            className="group relative overflow-hidden rounded-2xl border border-border bg-surface"
          >
            <div className="relative h-60">
              <Image
                src={img.src}
                alt={img.alt}
                fill
                sizes="(max-width: 768px) 100vw, 33vw"
                className="object-cover transition duration-500 group-hover:scale-110"
              />

              {/* Overlay elegante */}
              <div className="absolute inset-0 bg-gradient-to-t from-bg/80 via-bg/20 to-transparent opacity-70 transition group-hover:opacity-90" />
            </div>

            <div className="absolute bottom-0 p-4">
              <p className="text-sm text-white">{img.alt}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
