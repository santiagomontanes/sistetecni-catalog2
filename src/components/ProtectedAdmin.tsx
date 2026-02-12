'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, isAdmin } from '@/supabase/auth';

export default function ProtectedAdmin({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function check() {
      const session = await getSession();
      if (!session) {
        router.replace('/admin/login');
        return;
      }

      const ok = await isAdmin();
      if (!ok) {
        router.replace('/');
        return;
      }

      setLoading(false);
    }

    check();
  }, [router]);

  if (loading) return <p className="p-6">Cargando...</p>;

  return <>{children}</>;
}
