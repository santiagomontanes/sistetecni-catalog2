export default function Page({ params }: { params: { id: string } }) {
  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold">Producto</h1>
      <p className="mt-2 text-sm text-gray-600">ID: {params.id}</p>
    </main>
  );
}
