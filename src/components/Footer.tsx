export default function Footer() {
  return (
    <footer className="mt-16 border-t border-border bg-bg">
      <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-muted">
        <p>© {new Date().getFullYear()} Sistetecni. Todos los derechos reservados.</p>
      </div>
    </footer>
  );
}
