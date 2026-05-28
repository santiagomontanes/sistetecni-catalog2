"use client";

import { useEffect, useState } from "react";
import { getBusinessProfile } from "@/supabase/db";

// Cache a nivel de módulo: dura mientras la pestaña no se recargue.
// Evita pegarle a Supabase (y volver a descargar el logo de Storage)
// en cada navegación entre páginas del cliente.
let cachedLogoSrc: string | null = null;
let inflight: Promise<string> | null = null;

const SESSION_KEY = "sistetecni:logoUrl";

function readSessionLogo(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function writeSessionLogo(url: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SESSION_KEY, url);
  } catch {
    /* sin acceso a sessionStorage */
  }
}

async function fetchLogoOnce(): Promise<string> {
  if (cachedLogoSrc) return cachedLogoSrc;

  const persisted = readSessionLogo();
  if (persisted) {
    cachedLogoSrc = persisted;
    return persisted;
  }

  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const profile = await getBusinessProfile();
      const next = profile?.logoUrl || "/logo.svg";
      cachedLogoSrc = next;
      writeSessionLogo(next);
      return next;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export default function NavbarLogoClient() {
  const [logoSrc, setLogoSrc] = useState<string>(() => cachedLogoSrc ?? readSessionLogo() ?? "/logo.svg");

  useEffect(() => {
    if (cachedLogoSrc) return;
    fetchLogoOnce()
      .then((url) => setLogoSrc(url))
      .catch(() => {});
  }, []);

  return (
    <img
      src={logoSrc}
      alt="Sistetecni"
      width={32}
      height={32}
      loading="eager"
      decoding="async"
      className="h-8 w-8 rounded-lg object-contain"
    />
  );
}
