"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="grid gap-8 md:grid-cols-3">
          <div>
            <Link href="/" className="text-lg font-bold text-text">
              Siste<span className="text-primary">tecni</span>
            </Link>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">
              Laptops corporativas reacondicionadas con garantía real. Bogotá, Colombia.
            </p>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-text">Navegación</h4>
            <ul className="mt-3 space-y-2 text-sm">
              {navLinks.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-muted transition hover:text-primary">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-text">Contacto</h4>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              <li>📍 San Diego, Bogotá</li>
              <li>📱 +57 311 599 6339</li>
              <li>✉️ sistetecnioficial1@gmail.com</li>
            </ul>
          </div>
        </div>

        <div className="mt-8 border-t border-border pt-6 text-center text-xs text-muted">
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-2">
            <Link href="/politica-de-privacidad" className="transition hover:text-primary">Política de privacidad</Link>
            <Link href="/eliminacion-de-datos" className="transition hover:text-primary">Eliminación de datos</Link>
          </div>
          <div className="mt-4">© {new Date().getFullYear()} Sistetecni. Todos los derechos reservados.</div>
        </div>
      </div>
    </footer>
  );
}
