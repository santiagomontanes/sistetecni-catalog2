'use client';

import { useSearchParams } from 'next/navigation';

export default function ProductClient() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');

  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold">Producto</h1>
      <p className="mt-2 text-sm text-gray-600">ID: {id ?? 'No especificado'}</p>
    </main>
  );
}
