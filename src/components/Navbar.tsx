import Link from "next/link";

const links = [
  { href: "/", label: "Inicio" },
  { href: "/catalog", label: "Catálogo" },
  { href: "/contact", label: "Contacto" },
  { href: "/admin/login", label: "Admin" },
];

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-bg/80 backdrop-blur-md">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Link
          href="/"
          className="text-lg font-bold text-primary tracking-wide"
        >
          Sistetecni
        </Link>

        <ul className="flex items-center gap-6 text-sm font-medium text-muted">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="transition hover:text-accent"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
