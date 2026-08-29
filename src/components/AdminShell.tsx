"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { getErpProfile, signOutUser } from "@/supabase/auth";
import ProtectedAdmin from "@/components/ProtectedAdmin";
import {
  roleHasPermission,
  type ErpPermission,
  type ErpRole,
  ERP_ROLE_LABELS,
} from "@/lib/erpAuth/types";

type NavItem = {
  href: string;
  label: string;
  icon: string;
  exact: boolean;
  permission?: ErpPermission;
  adminOnly?: boolean;
};

const navItems: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: "🏠", exact: true },
  { href: "/admin/clientes", label: "Clientes", icon: "👥", exact: false, permission: "customers.manage" },
  { href: "/admin/proveedores", label: "Proveedores", icon: "🏢", exact: false, permission: "purchases.read" },
  { href: "/admin/compras", label: "Compras", icon: "🛒", exact: false, permission: "purchases.read" },
  { href: "/admin/inventario", label: "Inventario", icon: "🏷️", exact: false, permission: "inventory.read" },
  { href: "/admin/ventas", label: "Ventas", icon: "💵", exact: false, permission: "sales.read" },
  { href: "/admin/caja", label: "Caja", icon: "🧮", exact: false, permission: "cash.read" },
  { href: "/admin/gastos", label: "Gastos", icon: "💸", exact: false, permission: "expenses.read" },
  { href: "/admin/rentabilidad", label: "Rentabilidad", icon: "📊", exact: false, permission: "profitability.view" },
  { href: "/admin/reportes", label: "Reportes", icon: "📈", exact: false, permission: "reports.view" },
  { href: "/admin/garantias", label: "Garantías", icon: "🛠️", exact: false, permission: "warranties.open" },
  { href: "/admin/usuarios", label: "Usuarios", icon: "🧑‍💼", exact: false, permission: "users.manage" },
  { href: "/admin/productos", label: "Productos", icon: "📦", exact: false, adminOnly: true },
  { href: "/admin/upgrades", label: "Upgrades", icon: "🔧", exact: false, adminOnly: true },
  { href: "/admin/cotizaciones", label: "Cotizaciones", icon: "🧾", exact: false, adminOnly: true },
  { href: "/admin/galeria", label: "Galería", icon: "🖼️", exact: false, adminOnly: true },
  { href: "/admin/media", label: "Media inicio", icon: "🎬", exact: false, adminOnly: true },
  { href: "/admin/testimonios", label: "Testimonios", icon: "✍️", exact: false, adminOnly: true },
  { href: "/admin/configuracion", label: "Configuración", icon: "⚙️", exact: false, adminOnly: true },
];

function isItemActive(pathname: string, item: NavItem): boolean {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [role, setRole] = useState<ErpRole | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    void getErpProfile().then((profile) => {
      setRole(profile?.role ?? null);
      setName(profile?.displayName ?? null);
    });
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileOpen]);

  const visible = useMemo(
    () =>
      role
        ? navItems.filter((item) =>
            item.adminOnly
              ? role === "admin"
              : item.permission
                ? roleHasPermission(role, item.permission)
                : true
          )
        : [],
    [role]
  );

  const currentLabel = visible.find((item) => isItemActive(pathname, item))?.label ?? "Administración";

  const handleSignOut = async () => {
    await signOutUser();
    window.location.href = "/admin/login";
  };

  const navigation = (mobile = false) => (
    <nav className={mobile ? "space-y-1" : "sticky top-24 space-y-1 rounded-2xl border border-border bg-surface p-3"}>
      <div className={mobile ? "px-2 pb-3 pt-1" : "px-3 py-1.5"}>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">ERP Sistetecni</p>
        {role ? (
          <p className="mt-1 break-words text-[11px] text-primary">
            {name ?? ERP_ROLE_LABELS[role]} · {ERP_ROLE_LABELS[role]}
          </p>
        ) : null}
      </div>

      {visible.map((item) => {
        const active = isItemActive(pathname, item);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={mobile ? () => setMobileOpen(false) : undefined}
            className={`flex min-h-11 items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition touch-manipulation ${
              active ? "bg-primary text-white" : "text-muted hover:bg-border hover:text-text"
            }`}
          >
            <span className="shrink-0" aria-hidden="true">{item.icon}</span>
            <span className="min-w-0 truncate">{item.label}</span>
          </Link>
        );
      })}

      <div className="mt-2 border-t border-border pt-2">
        <button
          type="button"
          onClick={() => void handleSignOut()}
          className="flex min-h-11 w-full touch-manipulation items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-muted transition hover:bg-border hover:text-text"
        >
          <span aria-hidden="true">🚪</span>
          <span>Cerrar sesión</span>
        </button>
      </div>
    </nav>
  );

  return (
    <ProtectedAdmin>
      <div className="admin-shell w-full min-w-0 max-w-full overflow-x-clip">
        <div className="sticky top-2 z-30 mb-4 flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-border bg-surface/95 px-3 py-2 shadow-sm backdrop-blur lg:hidden">
          <div className="min-w-0">
            <p className="truncate text-[10px] font-semibold uppercase tracking-widest text-primary">ERP Sistetecni</p>
            <p className="truncate text-sm font-bold text-text">{currentLabel}</p>
          </div>
          <button
            type="button"
            aria-label="Abrir menú de administración"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(true)}
            className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-xl border border-border bg-white text-2xl leading-none text-text shadow-sm"
          >
            ☰
          </button>
        </div>

        <div className="flex min-h-[calc(100vh-200px)] min-w-0 gap-5">
          <aside className="hidden w-52 shrink-0 lg:block">{navigation()}</aside>
          <main className="w-full min-w-0 max-w-full overflow-x-hidden">{children}</main>
        </div>

        {mobileOpen ? (
          <div className="fixed inset-0 z-[100] lg:hidden" role="dialog" aria-modal="true" aria-label="Menú de administración">
            <button
              type="button"
              aria-label="Cerrar menú"
              onClick={() => setMobileOpen(false)}
              className="absolute inset-0 bg-black/45 backdrop-blur-[1px]"
            />
            <aside className="absolute inset-y-0 left-0 flex w-[min(86vw,320px)] max-w-full flex-col border-r border-border bg-surface shadow-2xl">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-widest text-primary">Administración</p>
                  <p className="truncate text-sm font-bold text-text">{currentLabel}</p>
                </div>
                <button
                  type="button"
                  aria-label="Cerrar menú de administración"
                  onClick={() => setMobileOpen(false)}
                  className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-xl border border-border bg-white text-2xl leading-none text-text"
                >
                  ×
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
                {navigation(true)}
              </div>
            </aside>
          </div>
        ) : null}
      </div>
    </ProtectedAdmin>
  );
}
