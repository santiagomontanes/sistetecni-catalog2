"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Facebook, HardDrive, Instagram, Keyboard, Laptop, Menu, Monitor, ShieldCheck, Wrench, X } from "lucide-react";
import NavbarLogoClient from "@/components/NavbarLogoClient";
import { socialFeed } from "@/config/social-feed";

const navLinks = [
  { href: "/", label: "Inicio" },
  { href: "/catalog", label: "Catálogo" },
  { href: "/personalizar", label: "Personaliza tu portátil" },
  { href: "/software", label: "Software" },
  { href: "/contact", label: "Contacto" },
];

const categories = [
  { icon: Laptop, label: "Laptops", href: "/catalog" },
  { icon: Monitor, label: "Monitores", href: "/catalog" },
  { icon: Keyboard, label: "Accesorios", href: "/catalog" },
  { icon: HardDrive, label: "Software", href: "/software" },
  { icon: ShieldCheck, label: "Garantía", href: "/contact" },
  { icon: Wrench, label: "Servicio Técnico", href: "/contact" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // El ERP tiene navegación propia. Evita dos menús y la tira comercial en móvil/tablet.
  if (pathname.startsWith("/admin")) return null;

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <header className="sticky top-0 z-50 bg-white">
      <div className="h-1.5 bg-primary" aria-hidden="true" />
      <div className="border-b border-ink/10">
        <div className="mx-auto max-w-6xl px-4">
          <nav className="flex items-center justify-between py-3" aria-label="Principal">
            <Link href="/" className="flex items-center gap-2.5 font-display text-[1.7rem] font-extrabold uppercase leading-none text-ink">
              <NavbarLogoClient />
              Siste<span className="text-primary">tecni</span>
            </Link>

            <ul className="hidden items-center gap-7 md:flex">
              {navLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={isActive(link.href) ? "page" : undefined}
                    className={`font-display text-lg font-bold uppercase tracking-wide transition-colors duration-150 hover:text-primary ${
                      isActive(link.href) ? "text-primary" : "text-ink/75"
                    }`}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>

            <div className="hidden items-center gap-1 md:flex">
              <a href={socialFeed.instagramProfile} target="_blank" rel="noopener noreferrer" aria-label="Instagram de Sistetecni" className="flex h-10 w-10 items-center justify-center rounded-lg text-ink/70 transition hover:bg-paper hover:text-primary">
                <Instagram className="h-5 w-5" aria-hidden="true" />
              </a>
              <a href={socialFeed.facebookProfile} target="_blank" rel="noopener noreferrer" aria-label="Facebook de Sistetecni" className="flex h-10 w-10 items-center justify-center rounded-lg text-ink/70 transition hover:bg-paper hover:text-primary">
                <Facebook className="h-5 w-5" aria-hidden="true" />
              </a>
              <Link href="/catalog" className="ml-2 rounded-lg bg-primary px-5 py-2 font-display text-lg font-bold uppercase tracking-wide text-white transition-colors hover:bg-ink">
                Ver equipos
              </Link>
            </div>

            <button className="flex h-11 w-11 items-center justify-center text-ink md:hidden" onClick={() => setOpen(!open)} aria-label="Menú" aria-expanded={open}>
              {open ? <X size={24} /> : <Menu size={24} />}
            </button>
          </nav>
        </div>
      </div>

      <div className="border-b border-ink/10 bg-paper">
        <div className="mx-auto max-w-6xl px-4">
          <div className="scrollbar-hide flex gap-2 overflow-x-auto py-2">
            {categories.map((cat) => {
              const Icon = cat.icon;
              return (
                <Link key={cat.label} href={cat.href} className="flex shrink-0 items-center gap-1.5 rounded-md border border-ink/15 bg-white px-3.5 py-1.5 font-body text-sm font-semibold text-ink/80 transition hover:border-primary hover:text-primary">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span>{cat.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {open && (
        <div className="border-b border-ink/10 bg-white px-4 py-5 md:hidden">
          <ul className="space-y-1">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="block py-2.5 font-display text-2xl font-bold uppercase text-ink transition hover:text-primary" onClick={() => setOpen(false)}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex gap-3">
            <a href={socialFeed.instagramProfile} target="_blank" rel="noopener noreferrer" className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg border-2 border-ink font-display text-lg font-bold uppercase text-ink">
              <Instagram className="h-5 w-5" aria-hidden="true" /> Instagram
            </a>
            <a href={socialFeed.facebookProfile} target="_blank" rel="noopener noreferrer" className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg border-2 border-ink font-display text-lg font-bold uppercase text-ink">
              <Facebook className="h-5 w-5" aria-hidden="true" /> Facebook
            </a>
          </div>
          <Link href="/catalog" className="mt-3 block w-full rounded-lg bg-primary py-3 text-center font-display text-xl font-bold uppercase text-white" onClick={() => setOpen(false)}>
            Ver equipos
          </Link>
        </div>
      )}
    </header>
  );
}
