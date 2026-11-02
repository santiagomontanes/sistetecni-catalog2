"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Beer, ChevronDown, Facebook, HardDrive, Instagram, Keyboard, Laptop, Menu, Monitor, Shirt, ShieldCheck, Store, UtensilsCrossed, Wrench, X } from "lucide-react";
import NavbarLogoClient from "@/components/NavbarLogoClient";
import { socialFeed } from "@/config/social-feed";
import { programas, type ProgramaSlug } from "@/lib/programas";

const navLinks = [
  { href: "/", label: "Inicio" },
  { href: "/catalog", label: "Catálogo" },
  { href: "/personalizar", label: "Personaliza tu portátil" },
  { href: "/programas", label: "Programas para tu negocio", programs: true },
  { href: "/contact", label: "Contacto" },
];

const programIcons: Record<ProgramaSlug, typeof Beer> = {
  bar: Beer,
  restaurante: UtensilsCrossed,
  lavanderia: Shirt,
  negocios: Store,
};

const linkClass = (active: boolean) =>
  `whitespace-nowrap font-display text-base font-bold uppercase tracking-wide transition-colors duration-150 hover:text-primary xl:text-lg ${active ? "text-primary" : "text-ink/75"}`;

// Menú de escritorio: se abre con el cursor (solo mouse), con toque/clic y con teclado.
function ProgramsDesktop({ active, pathname }: { active: boolean; pathname: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLLIElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const hoverOpen = (e: React.PointerEvent) => { if (e.pointerType !== "mouse") return; clearTimeout(closeTimer.current); setOpen(true); };
  const hoverClose = (e: React.PointerEvent) => { if (e.pointerType !== "mouse") return; closeTimer.current = setTimeout(() => setOpen(false), 120); };

  return (
    <li
      ref={root}
      className="relative"
      onPointerEnter={hoverOpen}
      onPointerLeave={hoverClose}
      onBlur={(e) => { if (!root.current?.contains(e.relatedTarget as Node)) setOpen(false); }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls="menu-programas"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 ${linkClass(active)}`}
      >
        Programas para tu negocio
        <ChevronDown className={`h-4 w-4 transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {/* El relleno superior deja el cursor "puenteado" entre el botón y el panel */}
      <div
        id="menu-programas"
        className={`absolute left-0 top-full z-50 w-64 origin-top-left pt-3 transition-[opacity,transform,visibility] duration-[160ms] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none ${
          open ? "visible translate-y-0 scale-100 opacity-100" : "invisible -translate-y-1 scale-[0.97] opacity-0"
        }`}
      >
        <ul className="overflow-hidden rounded-xl border border-ink/10 bg-white p-1.5 shadow-[0_18px_34px_-14px_rgba(11,16,32,0.35)]">
          {programas.map((p) => {
            const Icon = programIcons[p.slug];
            const here = pathname === p.href;
            return (
              <li key={p.slug}>
                <Link
                  href={p.href}
                  aria-current={here ? "page" : undefined}
                  className={`on-white flex h-12 items-center gap-3 rounded-lg px-3 font-display text-lg font-bold uppercase tracking-wide transition-colors duration-150 hover:bg-paper hover:text-primary ${here ? "bg-paper text-primary" : "text-ink"}`}
                >
                  <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                  {p.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </li>
  );
}

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
  const [programsOpen, setProgramsOpen] = useState(false);
  const pathname = usePathname();

  // Al entrar a una página de programas el submenú móvil ya viene abierto.
  useEffect(() => setProgramsOpen(pathname.startsWith("/programas")), [pathname]);

  // El ERP tiene navegación propia. Evita dos menús y la tira comercial en móvil/tablet.
  if (pathname.startsWith("/admin")) return null;

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <header className="sticky top-0 z-50 bg-white">
      <div className="h-1.5 bg-primary" aria-hidden="true" />
      <div className="border-b border-ink/10">
        <div className="mx-auto max-w-6xl px-4">
          <nav className="flex items-center justify-between py-3" aria-label="Principal">
            <Link href="/" className="flex shrink-0 items-center gap-2.5 font-display text-[1.7rem] font-extrabold uppercase leading-none text-ink">
              <NavbarLogoClient />
              Siste<span className="text-primary">tecni</span>
            </Link>

            <ul className="hidden items-center gap-6 xl:flex">
              {navLinks.map((link) =>
                link.programs ? (
                  <ProgramsDesktop key={link.href} active={isActive(link.href)} pathname={pathname} />
                ) : (
                  <li key={link.href}>
                    <Link href={link.href} aria-current={isActive(link.href) ? "page" : undefined} className={linkClass(isActive(link.href))}>
                      {link.label}
                    </Link>
                  </li>
                ),
              )}
            </ul>

            <div className="hidden items-center gap-1 xl:flex">
              <a href={socialFeed.instagramProfile} target="_blank" rel="noopener noreferrer" aria-label="Instagram de Sistetecni" className="hidden h-10 2xl:flex w-10 items-center justify-center rounded-lg text-ink/70 transition hover:bg-paper hover:text-primary">
                <Instagram className="h-5 w-5" aria-hidden="true" />
              </a>
              <a href={socialFeed.facebookProfile} target="_blank" rel="noopener noreferrer" aria-label="Facebook de Sistetecni" className="hidden h-10 2xl:flex w-10 items-center justify-center rounded-lg text-ink/70 transition hover:bg-paper hover:text-primary">
                <Facebook className="h-5 w-5" aria-hidden="true" />
              </a>
              <Link href="/catalog" className="ml-2 whitespace-nowrap rounded-lg bg-primary px-5 py-2 font-display text-lg font-bold uppercase tracking-wide text-white transition-colors hover:bg-ink">
                Ver equipos
              </Link>
            </div>

            <button className="flex h-11 w-11 items-center justify-center text-ink xl:hidden" onClick={() => setOpen(!open)} aria-label="Menú" aria-expanded={open}>
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
        <div className="border-b border-ink/10 bg-white px-4 py-5 xl:hidden">
          <ul className="space-y-1">
            {navLinks.map((link) =>
              link.programs ? (
                <li key={link.href}>
                  <button
                    type="button"
                    aria-expanded={programsOpen}
                    aria-controls="menu-programas-movil"
                    onClick={() => setProgramsOpen((v) => !v)}
                    className={`flex min-h-12 w-full items-center justify-between py-2.5 text-left font-display text-2xl font-bold uppercase transition-colors hover:text-primary ${isActive(link.href) ? "text-primary" : "text-ink"}`}
                  >
                    {link.label}
                    <ChevronDown className={`h-6 w-6 shrink-0 transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none ${programsOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                  </button>
                  {programsOpen && (
                    <ul id="menu-programas-movil" className="mb-2 ml-1 animate-fade-up space-y-1 border-l-2 border-primary/25 pl-4">
                      {programas.map((p) => {
                        const Icon = programIcons[p.slug];
                        return (
                          <li key={p.slug}>
                            <Link href={p.href} className={`flex min-h-12 items-center gap-3 font-display text-xl font-bold uppercase transition-colors hover:text-primary ${pathname === p.href ? "text-primary" : "text-ink/85"}`} onClick={() => setOpen(false)}>
                              <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                              {p.label}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              ) : (
                <li key={link.href}>
                  <Link href={link.href} className="block py-2.5 font-display text-2xl font-bold uppercase text-ink transition hover:text-primary" onClick={() => setOpen(false)}>
                    {link.label}
                  </Link>
                </li>
              ),
            )}
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
