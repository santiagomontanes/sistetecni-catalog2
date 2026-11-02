"use client";

import { useMemo, useState } from "react";

export default function ProductGallery({
  images,
  title,
}: {
  images: string[];
  title: string;
}) {
  const safeImages = useMemo(() => (images?.length ? images : ["/placeholder.jpg"]), [images]);
  const [active, setActive] = useState(0);

  // lupa
  const [isZoom, setIsZoom] = useState(false);
  const [pos, setPos] = useState({ x: 50, y: 50 }); // porcentaje

  const activeSrc = safeImages[active];

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setPos({ x, y });
  };

  return (
    <div className="space-y-3">
      {/* Imagen principal con lupa */}
      <div
        className="group relative overflow-hidden rounded-xl border-2 border-ink bg-paper"
        onMouseEnter={() => setIsZoom(true)}
        onMouseLeave={() => setIsZoom(false)}
        onMouseMove={onMove}
      >
        <img
          src={activeSrc}
          alt={title}
          loading="eager"
          decoding="async"
          fetchPriority="high"
          className="h-[320px] w-full object-cover sm:h-[420px] transition-transform duration-200"
        />

        {/* Capa lupa */}
        <div
          className={`pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-150 ${
            isZoom ? "opacity-100" : "opacity-0"
          }`}
          style={{
            backgroundImage: `url(${activeSrc})`,
            backgroundRepeat: "no-repeat",
            backgroundSize: "220%",
            backgroundPosition: `${pos.x}% ${pos.y}%`,
          }}
        />

        {/* Hint */}
        <div className="absolute bottom-3 left-3 rounded bg-ink px-3 py-1 font-data text-[11px] uppercase tracking-wider text-white">
          Pasa el mouse para zoom
        </div>
      </div>

      {/* Miniaturas */}
      <div className="flex gap-3 overflow-x-auto">
        {safeImages.slice(0, 6).map((src, idx) => (
          <button
            key={`${src}-${idx}`}
            type="button"
            onClick={() => setActive(idx)}
            className={`shrink-0 overflow-hidden rounded-lg border-2 transition ${
              idx === active
                ? "border-primary"
                : "border-ink/20 hover:border-ink"
            }`}
          >
            <img
              src={src}
              alt={`${title} mini ${idx + 1}`}
              loading="lazy"
              decoding="async"
              className="h-16 w-16 object-cover"
            />
          </button>
        ))}
      </div>
    </div>
  );
}
