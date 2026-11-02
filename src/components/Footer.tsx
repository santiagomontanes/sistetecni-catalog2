"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Facebook, Instagram, Mail, MapPin, Phone } from "lucide-react";
import { socialFeed } from "@/config/social-feed";

const navLinks = [
  { href: "/catalog", label: "Catálogo" },
  { href: "/software", label: "Software" },
  { href: "/contact", label: "Contacto" },
  { href: "/admin/login", label: "Admin" },
];

export default function Footer() {
  const pathname = usePathname();
  if (pathname.startsWith("/admin")) return null;

  return (
    <footer className="bg-ink text-white">
      <div className="mx-auto max-w-6xl px-4 py-14">
        <div className="grid gap-10 md:grid-cols-[1.3fr_1fr_1.2fr]">
          <div>
            <Link href="/" className="font-display text-4xl font-extrabold uppercase leading-none">
              Siste<span className="text-tape">tecni</span>
            </Link>
            <p className="mt-4 max-w-xs font-body text-base leading-relaxed text-white/75">
              Laptops corporativas reacondicionadas con garantía real. Bogotá, Colombia.
            </p>
            <div className="mt-6 flex gap-3">
              <a href={socialFeed.instagramProfile} target="_blank" rel="noopener noreferrer" aria-label="Instagram de Sistetecni" className="flex h-11 w-11 items-center justify-center rounded-lg border-2 border-white/30 transition hover:border-tape hover:bg-tape hover:text-ink">
                <Instagram className="h-5 w-5" aria-hidden="true" />
              </a>
              <a href={socialFeed.facebookProfile} target="_blank" rel="noopener noreferrer" aria-label="Facebook de Sistetecni" className="flex h-11 w-11 items-center justify-center rounded-lg border-2 border-white/30 transition hover:border-tape hover:bg-tape hover:text-ink">
                <Facebook className="h-5 w-5" aria-hidden="true" />
              </a>
            </div>
          </div>

          <div>
            <h4 className="font-display text-xl font-bold uppercase tracking-wide text-tape">Navegación</h4>
            <ul className="mt-4 space-y-2.5 font-body text-base">
              {navLinks.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-white/80 transition hover:text-white hover:underline">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-display text-xl font-bold uppercase tracking-wide text-tape">Contacto</h4>
            <ul className="mt-4 space-y-3 font-body text-base text-white/80">
              <li className="flex items-center gap-3"><MapPin className="h-5 w-5 shrink-0 text-tape" aria-hidden="true" />San Diego, Bogotá</li>
              <li className="flex items-center gap-3"><Phone className="h-5 w-5 shrink-0 text-tape" aria-hidden="true" />+57 311 599 6339</li>
              <li className="flex items-center gap-3"><Mail className="h-5 w-5 shrink-0 text-tape" aria-hidden="true" /><span className="break-all">sistetecnioficial1@gmail.com</span></li>
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-white/15 pt-6 text-center font-body text-sm text-white/60">
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-2">
            <Link href="/politica-de-privacidad" className="transition hover:text-white">Política de privacidad</Link>
            <Link href="/eliminacion-de-datos" className="transition hover:text-white">Eliminación de datos</Link>
          </div>
          <div className="mt-4">© {new Date().getFullYear()} Sistetecni. Todos los derechos reservados.</div>
        </div>
      </div>
    </footer>
  );
}
