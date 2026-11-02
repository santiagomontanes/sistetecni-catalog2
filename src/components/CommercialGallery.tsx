import Image from "next/image";
import type { GalleryImage } from "@/types/gallery";

const STATIC_IMAGES = [
  { src: "/gallery/1.jpg", alt: "Laptop corporativa reacondicionada" },
  { src: "/gallery/2.jpg", alt: "Equipo empresarial listo para entrega" },
  { src: "/gallery/3.jpg", alt: "Portátil para estudio y trabajo" },
  { src: "/gallery/4.jpg", alt: "Revisión y mantenimiento profesional" },
  { src: "/gallery/5.jpg", alt: "Equipos alineados en inventario" },
  { src: "/gallery/6.jpg", alt: "Computadores corporativos en excelente estado" },
];

interface CommercialGalleryProps {
  images?: GalleryImage[];
}

export default function CommercialGallery({ images }: CommercialGalleryProps) {
  const items =
    images && images.length > 0
      ? images.map((img) => ({ src: img.url, alt: img.caption ?? "Equipo Sistetecni" }))
      : STATIC_IMAGES;

  return (
    <section className="on-white py-20">
      <h2 className="font-display text-4xl font-extrabold uppercase leading-none text-ink md:text-5xl">
        Equipos reales, calidad real
      </h2>
      <p className="mt-3 max-w-xl font-body text-lg text-ink/70">
        Fotografías de inventario y procesos reales de Sistetecni.
      </p>

      <div className="mt-10 grid auto-rows-[200px] gap-3 sm:grid-cols-2 md:auto-rows-[230px] md:grid-cols-3">
        {items.map((img, idx) => (
          <figure
            key={img.src + idx}
            className={`group relative overflow-hidden rounded-lg bg-paper ${idx === 0 ? "sm:col-span-2 md:row-span-2" : ""}`}
          >
            <Image
              src={img.src}
              alt={img.alt}
              fill
              loading="lazy"
              sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, 33vw"
              className="object-cover transition duration-500 group-hover:scale-105 motion-reduce:transition-none"
            />
            <figcaption className="absolute bottom-3 left-3 max-w-[85%] rounded bg-white px-2.5 py-1 font-data text-[11px] font-medium uppercase leading-snug tracking-wide text-ink">
              {img.alt}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
