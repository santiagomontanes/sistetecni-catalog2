type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function Page({ params }: PageProps) {
  const { id } = await params;

  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold">Producto</h1>
      <p className="mt-2 text-sm text-gray-600">ID: {id}</p>
    </main>
  );
}
