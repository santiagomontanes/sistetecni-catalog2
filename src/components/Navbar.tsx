"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";

const navLinks = [
  { href: "/", label: "Inicio" },
  { href: "/catalog", label: "Catálogo" },
  { href: "/software", label: "Software" },
  { href: "/contact", label: "Contacto" },
];

const categories = [
  { icon: "💻", label: "Laptops", href: "/catalog" },
  { icon: "🖥️", label: "Monitores", href: "/catalog" },
  { icon: "⌨️", label: "Accesorios", href: "/catalog" },
  { icon: "💾", label: "Software", href: "/software" },
  { icon: "🛡️", label: "Garantía", href: "/contact" },
  { icon: "🔧", label: "Servicio Técnico", href: "/contact" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-white shadow-sm">
      {/* Main nav row */}
      <div className="mx-auto max-w-6xl px-4">
        <nav className="flex items-center justify-between py-4">
          <Link href="/" className="text-xl font-bold text-text">
            Siste<span className="text-primary">tecni</span>
          </Link>

          {/* Desktop links */}
          <ul className="hidden items-center gap-7 text-sm font-medium md:flex">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-muted transition hover:text-text"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>

          {/* Desktop CTA */}
          <div className="hidden md:block">
            <Link
              href="/catalog"
              className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white transition hover:bg-primary/90"
            >
              Ver equipos
            </Link>
          </div>

          {/* Mobile toggle */}
          <button
            className="md:hidden text-text"
            onClick={() => setOpen(!open)}
            aria-label="Menú"
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </nav>
      </div>

      {/* Category strip */}
      <div className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4">
          <div className="scrollbar-hide flex gap-2 overflow-x-auto py-2">
            {categories.map((cat) => (
              <Link
                key={cat.label}
                href={cat.href}
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-border px-4 py-1.5 text-xs font-medium text-muted transition hover:border-primary hover:text-primary"
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile menu dropdown */}
      {open && (
        <div className="border-t border-border bg-white px-4 py-5 md:hidden">
          <ul className="space-y-4 text-sm font-medium">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="block text-text transition hover:text-primary"
                  onClick={() => setOpen(false)}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href="/catalog"
            className="mt-5 block w-full rounded-full bg-primary py-3 text-center text-sm font-semibold text-white"
            onClick={() => setOpen(false)}
          >
            Ver equipos
          </Link>
        </div>
      )}
    </header>
  );
}
