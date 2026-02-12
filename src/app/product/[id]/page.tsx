type PageProps = { params: { id: string } };

export default function ProductPage({ params }: PageProps) {
  return (
    <section className="space-y-4">
      <h1 className="text-3xl font-bold text-slate-900">Detalle del producto</h1>
      <p className="text-sm text-slate-600">ID del producto: {params.id}</p>
      <div className="rounded-xl border border-slate-200 p-6">
        <p className="text-sm text-slate-700">Contenido de detalle (placeholder para V1).</p>
      </div>
    </section>
  );
}
