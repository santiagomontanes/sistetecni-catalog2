"use client";

import { useState } from "react";
import { Facebook, Instagram, Play } from "lucide-react";
import { socialFeed } from "@/config/social-feed";
import type { SocialLinks } from "@/types/business";

export type Net = "instagram" | "facebook";

// Convierte el enlace de un post al URL del embed oficial de cada red.
export function embedUrl(net: Net, url: string): string | null {
  const clean = url.trim();
  if (!clean) return null;
  if (net === "instagram") {
    const m = clean.match(/instagram\.com\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
    if (!m) return null;
    return `https://www.instagram.com/${m[1] === "reels" ? "reel" : m[1]}/${m[2]}/embed`;
  }
  if (!/facebook\.com|fb\.watch/.test(clean)) return null;
  return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(clean)}&show_text=false&t=0`;
}

const META: Record<Net, { name: string; icon: typeof Instagram; label: string }> = {
  instagram: { name: "Instagram", icon: Instagram, label: "Último video en Instagram" },
  facebook: { name: "Facebook", icon: Facebook, label: "Último video en Facebook" },
};

function handleOf(profile: string) {
  const m = profile.match(/instagram\.com\/([A-Za-z0-9_.]+)/);
  return m ? `@${m[1]}` : "Sistetecni";
}

function VideoFrame({ net, post, profile }: { net: Net; post: string; profile: string }) {
  const [playing, setPlaying] = useState(false);
  const src = embedUrl(net, post);
  const { name, icon: Icon, label } = META[net];

  return (
    <article className="flex flex-col">
      <div className="relative mx-auto aspect-[9/16] w-full max-w-[340px] max-h-[620px] overflow-hidden rounded-[2rem] border-[6px] border-white/90 bg-ink shadow-[0_28px_50px_-24px_rgba(0,0,0,0.8)]">
        {src && playing ? (
          <iframe
            src={src}
            title={`${label} de Sistetecni`}
            className="absolute inset-0 h-full w-full bg-white"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            loading="lazy"
            style={{ border: "none" }}
          />
        ) : (
          <button
            type="button"
            disabled={!src}
            onClick={() => setPlaying(true)}
            className="group absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-primary to-[#0f3aa0] p-6 text-center text-white disabled:cursor-default"
            aria-label={src ? `Reproducir ${label.toLowerCase()}` : undefined}
          >
            <Icon className="h-9 w-9 opacity-90" aria-hidden="true" />
            <p className="font-display text-3xl font-extrabold uppercase leading-none">{src ? label : `Sistetecni en ${name}`}</p>
            {src ? (
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-tape text-ink transition duration-200 group-hover:scale-110 motion-reduce:transition-none">
                <Play className="ml-1 h-7 w-7 fill-current" aria-hidden="true" />
              </span>
            ) : (
              <p className="font-data text-sm font-medium tracking-wide text-tape">{net === "instagram" ? handleOf(profile) : "Sistetecni"}</p>
            )}
          </button>
        )}
      </div>

      <a
        href={profile}
        target="_blank"
        rel="noopener noreferrer"
        className="mx-auto mt-5 inline-flex h-12 items-center gap-2 rounded-xl bg-white px-6 font-display text-lg font-bold uppercase tracking-wide text-ink transition duration-200 hover:bg-tape motion-reduce:transition-none"
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
        {src ? `Abrir en ${name}` : `Seguir en ${name}`}
      </a>
    </article>
  );
}

export default function SocialVideos({ socialLinks }: { socialLinks?: SocialLinks | null }) {
  const ig = socialLinks?.instagram
    ? `https://www.instagram.com/${socialLinks.instagram.replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "")}`
    : socialFeed.instagramProfile;
  const fb = socialLinks?.facebook
    ? socialLinks.facebook.startsWith("http")
      ? socialLinks.facebook
      : `https://www.facebook.com/${socialLinks.facebook.replace(/^\//, "")}`
    : socialFeed.facebookProfile;

  return (
    <section className="bleed bg-ink py-20 text-white">
      <div className="mx-auto max-w-6xl px-4">
        <h2 className="font-display text-4xl font-extrabold uppercase leading-none md:text-5xl">
          Lo último en nuestras redes
        </h2>
        <p className="mt-3 max-w-xl font-body text-lg text-white/75">
          Entregas, equipos nuevos y el día a día de Sistetecni. Mira el video más reciente sin salir de la página.
        </p>

        <div className="mt-12 grid gap-14 md:grid-cols-2">
          <VideoFrame net="instagram" post={socialFeed.latestInstagramPost} profile={ig} />
          <VideoFrame net="facebook" post={socialFeed.latestFacebookVideo} profile={fb} />
        </div>
      </div>
    </section>
  );
}
