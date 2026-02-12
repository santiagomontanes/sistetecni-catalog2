'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { subscribeToAuth } from '@/firebase/auth';
import { getUserRole } from '@/firebase/firestore';

interface ProtectedAdminProps {
  children: ReactNode;
}

export default function ProtectedAdmin({ children }: ProtectedAdminProps) {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToAuth(async (user) => {
      if (!user) {
        setAccessDenied(false);
        setIsChecking(false);
        router.replace('/admin/login');
        return;
      }

      const roleData = await getUserRole(user.uid);
      const isAdmin = roleData?.role === 'admin' && roleData.active === true;

      setAccessDenied(!isAdmin);
      setIsChecking(false);
    });

    return unsubscribe;
  }, [router]);

  if (isChecking) {
    return <p className="text-sm text-slate-500">Verificando acceso...</p>;
  }

  if (accessDenied) {
    return <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700">Acceso denegado</p>;
  }

  return <>{children}</>;
}
