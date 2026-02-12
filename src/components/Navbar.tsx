import Link from 'next/link';

const links = [
  { href: '/', label: 'Inicio' },
  { href: '/catalog', label: 'Catálogo' },
  { href: '/contact', label: 'Contacto' },
  { href: '/admin/login', label: 'Admin' },
];

export default function Navbar() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Link href="/" className="text-lg font-bold text-brand-700">
          Sistetecni
        </Link>
        <ul className="flex items-center gap-4 text-sm font-medium text-slate-700">
          {links.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="transition hover:text-brand-700">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
