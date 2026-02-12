import { Suspense } from 'react';
import ProductClient from './ProductClient';

export default function ProductPage() {
  return (
    <Suspense fallback="Cargando...">
      <ProductClient />
    </Suspense>
  );
}
