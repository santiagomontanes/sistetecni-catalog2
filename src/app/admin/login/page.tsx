'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn, isAdmin } from '@/supabase/auth';
export const dynamic = 'force-dynamic';
export const revalidate = 0;



function toFriendlyError(code: string): string {
  if (code === 'auth/invalid-credential') return 'Correo o contraseña incorrectos.';
  if (code === 'auth/too-many-requests') return 'Demasiados intentos. Intenta más tarde.';
  if (code === 'auth/network-request-failed') return 'No hay conexión a internet.';
  return 'No fue posible iniciar sesión. Intenta nuevamente.';
}

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
  await signIn(email, password);

  const ok = await isAdmin();
  if (!ok) {
    setError("Tu usuario no tiene permisos de administrador.");
    return;
  }

  router.replace('/admin/dashboard');
} catch (err: unknown) {
  const msg =
    typeof err === "object" && err && "message" in err ? String((err as any).message) : "";

  // mensajes típicos de Supabase
  if (msg.toLowerCase().includes("invalid login credentials")) {
    setError("Correo o contraseña incorrectos.");
  } else if (msg.toLowerCase().includes("too many requests")) {
    setError("Demasiados intentos. Intenta más tarde.");
  } else if (msg.toLowerCase().includes("network")) {
    setError("No hay conexión a internet.");
  } else {
    setError("No fue posible iniciar sesión. Intenta nuevamente.");
  }
} finally {
  setLoading(false);
}

  };

  return (
    <section className="mx-auto max-w-md space-y-4">
      <h1 className="text-3xl font-bold text-slate-900">Ingreso de administrador</h1>
      <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-6">
        <div>
          <label className="mb-1 block text-sm text-slate-700">Correo</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded border border-slate-300 p-2"
            placeholder="admin@correo.com"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-700">Contraseña</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded border border-slate-300 p-2"
            placeholder="********"
          />
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button disabled={loading} className="w-full rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
          {loading ? 'Ingresando...' : 'Iniciar sesión'}
        </button>
      </form>
    </section>
  );
}
