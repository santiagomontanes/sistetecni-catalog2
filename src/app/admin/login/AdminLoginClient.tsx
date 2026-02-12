'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { isAdmin, signIn } from '@/supabase/auth';

function toFriendlyError(message: string): string {
  const msg = message.toLowerCase();
  if (msg.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.';
  if (msg.includes('too many requests')) return 'Demasiados intentos. Intenta más tarde.';
  if (msg.includes('network')) return 'No hay conexión a internet.';
  return 'No fue posible iniciar sesión. Intenta nuevamente.';
}

function getErrorMessage(err: unknown): string {
  if (!err) return '';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return '';
}

export default function AdminLoginClient() {
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
        setError('Tu usuario no tiene permisos de administrador.');
        return;
      }

      router.replace('/admin/dashboard');
    } catch (err: unknown) {
      const msg = getErrorMessage(err);
      setError(toFriendlyError(msg));
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

        <button
          disabled={loading}
          className="w-full rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {loading ? 'Ingresando...' : 'Iniciar sesión'}
        </button>
      </form>
    </section>
  );
}
