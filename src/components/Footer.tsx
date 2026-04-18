import Link from "next/link";

const navLinks = [
  { href: "/catalog", label: "Catálogo" },
  { href: "/software", label: "Software" },
  { href: "/contact", label: "Contacto" },
  { href: "/admin/login", label: "Admin" },
];

export default function Footer() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="grid gap-8 md:grid-cols-3">
          {/* Brand */}
          <div>
            <Link href="/" className="text-lg font-bold text-text">
              Siste<span className="text-primary">tecni</span>
            </Link>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">
              Laptops corporativas reacondicionadas con garantía real. Bogotá, Colombia.
            </p>
          </div>

          {/* Navigation */}
          <div>
            <h4 className="text-sm font-semibold text-text">Navegación</h4>
            <ul className="mt-3 space-y-2 text-sm">
              {navLinks.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-muted transition hover:text-primary"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-sm font-semibold text-text">Contacto</h4>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              <li>📍 San Diego, Bogotá</li>
              <li>📱 +57 320 221 0698</li>
              <li>✉️ sistetecnioficial1@gmail.com</li>
            </ul>
          </div>
        </div>

        <div className="mt-8 border-t border-border pt-6 text-center text-xs text-muted">
          © {new Date().getFullYear()} Sistetecni. Todos los derechos reservados.
        </div>
      </div>
    </footer>
  );
}
