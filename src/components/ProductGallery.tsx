"use client";

import { useMemo, useState } from "react";

export default function ProductGallery({
  images,
  title,
}: {
  images: string[];
  title: string;
}) {
  const safeImages = useMemo(
    () => (images?.length ? images : ["/placeholder.jpg"]),
    [images]
  );

  const [active, setActive] = useState(safeImages[0]);

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <img
          src={active}
          alt={title}
          className="h-[340px] w-full object-cover md:h-[420px]"
        />
      </div>

      <div className="flex gap-3 overflow-x-auto pb-1">
        {safeImages.map((src) => {
          const isActive = src === active;
          return (
            <button
              key={src}
              onClick={() => setActive(src)}
              className={`shrink-0 overflow-hidden rounded-xl border transition ${
                isActive ? "border-primary" : "border-border"
              }`}
              title="Ver imagen"
              type="button"
            >
              <img src={src} alt={title} className="h-16 w-20 object-cover" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
