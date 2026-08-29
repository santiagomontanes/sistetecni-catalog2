"use client";

import Link from "next/link";
import {useEffect,useState} from "react";
import { usePathname } from "next/navigation";
import { getErpProfile, signOutUser } from "@/supabase/auth";
import ProtectedAdmin from "@/components/ProtectedAdmin";
import {roleHasPermission,type ErpPermission,type ErpRole,ERP_ROLE_LABELS} from "@/lib/erpAuth/types";

type NavItem={href:string;label:string;icon:string;exact:boolean;permission?:ErpPermission;adminOnly?:boolean};
const navItems:NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: "🏠", exact: true },
  { href: "/admin/clientes", label: "Clientes", icon: "👥", exact: false,permission:"customers.manage" },
  { href: "/admin/proveedores", label: "Proveedores", icon: "🏢", exact: false,permission:"purchases.read" },
  { href: "/admin/compras", label: "Compras", icon: "🛒", exact: false,permission:"purchases.read" },
  { href: "/admin/inventario", label: "Inventario", icon: "🏷️", exact: false,permission:"inventory.read" },
  { href: "/admin/ventas", label: "Ventas", icon: "💵", exact: false,permission:"sales.read" },
  { href: "/admin/caja", label: "Caja", icon: "🧮", exact: false,permission:"cash.read" },
  { href: "/admin/gastos", label: "Gastos", icon: "💸", exact: false,permission:"expenses.read" },
  { href: "/admin/rentabilidad", label: "Rentabilidad", icon: "📊", exact: false,permission:"profitability.view" },
  { href: "/admin/reportes", label: "Reportes", icon: "📈", exact: false,permission:"reports.view" },
  { href: "/admin/garantias", label: "Garantías", icon: "🛠️", exact: false,permission:"warranties.open" },
  { href: "/admin/usuarios", label: "Usuarios", icon: "🧑‍💼", exact: false,permission:"users.manage" },
  { href: "/admin/productos", label: "Productos", icon: "📦", exact: false,adminOnly:true },
  { href: "/admin/upgrades", label: "Upgrades", icon: "🔧", exact: false,adminOnly:true },
  { href: "/admin/cotizaciones", label: "Cotizaciones", icon: "🧾", exact: false,adminOnly:true },
  { href: "/admin/galeria", label: "Galería", icon: "🖼️", exact: false,adminOnly:true },
  { href: "/admin/media", label: "Media inicio", icon: "🎬", exact: false,adminOnly:true },
  { href: "/admin/testimonios", label: "Testimonios", icon: "✍️", exact: false,adminOnly:true },
  { href: "/admin/configuracion", label: "Configuración", icon: "⚙️", exact: false,adminOnly:true },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();const[role,setRole]=useState<ErpRole|null>(null);const[name,setName]=useState<string|null>(null);
  useEffect(()=>{void getErpProfile().then(p=>{setRole(p?.role??null);setName(p?.displayName??null);});},[]);
  const visible=role?navItems.filter(i=>i.adminOnly?role==="admin":i.permission?roleHasPermission(role,i.permission):true):[];
  return (
    <ProtectedAdmin>
      <div className="flex gap-5 min-h-[calc(100vh-200px)]">
        <aside className="w-52 shrink-0">
          <nav className="sticky top-24 rounded-2xl border border-border bg-surface p-3 space-y-1">
            <div className="px-3 py-1.5"><p className="text-xs font-semibold uppercase tracking-widest text-muted">ERP Sistetecni</p>{role?<p className="mt-1 text-[11px] text-primary">{name??ERP_ROLE_LABELS[role]} · {ERP_ROLE_LABELS[role]}</p>:null}</div>
            {visible.map((item) => {
              const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
              return <Link key={item.href} href={item.href} className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition ${isActive ? "bg-primary text-white" : "text-muted hover:bg-border hover:text-text"}`}><span>{item.icon}</span><span>{item.label}</span></Link>;
            })}
            <div className="pt-2 border-t border-border"><button onClick={async()=>{await signOutUser();window.location.href="/admin/login";}} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-muted transition hover:bg-border hover:text-text"><span>🚪</span><span>Cerrar sesión</span></button></div>
          </nav>
        </aside>
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </ProtectedAdmin>
  );
}
