interface GalleryProps {
  photos: string[];
}

export default function Gallery({ photos }: GalleryProps) {
  return (
    <section>
      <h2 className="text-2xl font-semibold text-slate-900">Galería local</h2>
      {photos.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
          Aún no hay fotos disponibles.
        </p>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {photos.map((photo, index) => (
            <img
              key={`${photo}-${index}`}
              src={photo}
              alt={`Foto local ${index + 1}`}
              className="h-40 w-full rounded-xl object-cover"
            />
          ))}
        </div>
      )}
    </section>
  );
}
