"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutUser } from "@/supabase/auth";
import ProtectedAdmin from "@/components/ProtectedAdmin";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: "🏠", exact: true },
  { href: "/admin/productos", label: "Productos", icon: "📦", exact: false },
  { href: "/admin/galeria", label: "Galería", icon: "🖼️", exact: false },
  { href: "/admin/media", label: "Media inicio", icon: "🎬", exact: false },
  { href: "/admin/testimonios", label: "Testimonios", icon: "✍️", exact: false },
  { href: "/admin/configuracion", label: "Configuración", icon: "⚙️", exact: false },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <ProtectedAdmin>
      <div className="flex gap-5 min-h-[calc(100vh-200px)]">
        {/* Sidebar */}
        <aside className="w-48 shrink-0">
          <nav className="sticky top-24 rounded-2xl border border-border bg-surface p-3 space-y-1">
            <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-widest text-muted">
              Panel Admin
            </p>
            {navItems.map((item) => {
              const isActive = item.exact
                ? pathname === item.href
                : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition ${
                    isActive
                      ? "bg-primary text-white"
                      : "text-muted hover:bg-border hover:text-text"
                  }`}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
            <div className="pt-2 border-t border-border">
              <button
                onClick={async () => {
                  await signOutUser();
                  window.location.href = "/admin/login";
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-muted transition hover:bg-border hover:text-text"
              >
                <span>🚪</span>
                <span>Cerrar sesión</span>
              </button>
            </div>
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </ProtectedAdmin>
  );
}
