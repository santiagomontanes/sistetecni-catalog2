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
        className="group relative overflow-hidden rounded-2xl border border-border bg-surface"
        onMouseEnter={() => setIsZoom(true)}
        onMouseLeave={() => setIsZoom(false)}
        onMouseMove={onMove}
      >
        <img
          src={activeSrc}
          alt={title}
          className="h-[420px] w-full object-cover transition-transform duration-200"
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
        <div className="absolute bottom-3 left-3 rounded-full border border-border bg-bg/40 px-3 py-1 text-xs text-text backdrop-blur">
          Pasa el mouse para zoom
        </div>
      </div>

      {/* Miniaturas */}
      <div className="flex gap-3">
        {safeImages.slice(0, 6).map((src, idx) => (
          <button
            key={`${src}-${idx}`}
            type="button"
            onClick={() => setActive(idx)}
            className={`overflow-hidden rounded-xl border transition ${
              idx === active
                ? "border-accent/70 ring-2 ring-accent/30"
                : "border-border hover:border-accent/40"
            }`}
          >
            <img src={src} alt={`${title} mini ${idx + 1}`} className="h-16 w-16 object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}
