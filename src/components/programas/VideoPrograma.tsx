"use client";

import { useState } from "react";
import { Facebook, Instagram, Play } from "lucide-react";
import { embedUrl, type Net } from "@/components/home/SocialVideos";

const META = {
  instagram: { name: "Instagram", icon: Instagram },
  facebook: { name: "Facebook", icon: Facebook },
} as const;

// Mismo marco de teléfono y mismo embed oficial de la sección «Lo último en nuestras redes».
// Sin enlace (post vacío) muestra un espacio limpio que no parece roto.
export default function VideoPrograma({ net, post, title }: { net: Net; post: string; title: string }) {
  const [playing, setPlaying] = useState(false);
  const src = embedUrl(net, post);
  const { icon: Icon } = META[net];

  return (
    <div className="relative mx-auto aspect-[9/16] w-[min(100%,300px)] max-h-[620px] md:w-[320px] overflow-hidden rounded-[2rem] border-[6px] border-white/90 bg-ink shadow-[0_28px_50px_-24px_rgba(0,0,0,0.8)]">
      {src && playing ? (
        <iframe
          src={src}
          title={title}
          className="absolute inset-0 h-full w-full bg-white"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          loading="lazy"
          style={{ border: "none" }}
        />
      ) : src ? (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="group absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-primary to-[#0f3aa0] p-6 text-center text-white"
          aria-label={`Reproducir: ${title}`}
        >
          <Icon className="h-9 w-9 opacity-90" aria-hidden="true" />
          <p className="font-display text-3xl font-extrabold uppercase leading-none">{title}</p>
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-tape text-ink transition duration-200 group-hover:scale-110 group-active:scale-95 motion-reduce:transition-none">
            <Play className="ml-1 h-7 w-7 fill-current" aria-hidden="true" />
          </span>
        </button>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-primary to-[#0f3aa0] p-6 text-center text-white">
          <Play className="h-10 w-10 opacity-80" aria-hidden="true" />
          <p className="font-display text-3xl font-extrabold uppercase leading-none">El video llega muy pronto</p>
          <p className="font-body text-sm text-white/80">Mientras tanto, agenda tu demo por WhatsApp.</p>
        </div>
      )}
    </div>
  );
}
